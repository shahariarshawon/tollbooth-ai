import { Injectable, Logger, Optional } from '@nestjs/common';
import type { LedgerTransactionType } from '@tollbooth/database';
import { KAFKA_PROVIDER_TOPIC, KAFKA_USAGE_TOPIC, KafkaService } from '@tollbooth/kafka';
import type { ProviderFailedEvent, UsageCompletedEvent } from '@tollbooth/kafka';
import { AlertService } from '../alerts/alert.service';
import { recordAiFailure, recordAiSuccess } from '../metrics/metrics';
import type { RecordInput } from '../requests/request.service';
import { RequestService } from '../requests/request.service';
import type { TokenUsage } from '../requests/request.service';
import { OutboxService } from './outbox.service';
import { UsageRepository, chargeAmount } from './usage.repository';

/**
 * Pipeline step 9, in full: record what happened (`ai_requests`), what it cost (`ledger_entries`),
 * and announce it reliably via Transactional Outbox (Phase 3) to Kafka.
 *
 * Token counting (`TokenCounter`) and cost calculation (`budget/cost-estimator.ts`) already happen
 * upstream, in the provider and in `TrafficControlService.complete`, the same provider-independent way
 * for every provider; this service files the record of the outcome.
 *
 * When the database transaction commits, the request record, the financial ledger charge, and the
 * outbox event are guaranteed to be committed together atomically. If Kafka is unavailable, the
 * event remains safely persisted in PostgreSQL and is swept by the outbox relay upon broker recovery.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly requests: RequestService,
    private readonly ledger: UsageRepository,
    private readonly kafka: KafkaService,
    private readonly alerts: AlertService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  /**
   * A successful call: records `ai_requests`, `ledger_entries`, and `outbox_events` atomically.
   * If OutboxService is present, dispatches immediately; otherwise falls back to direct publish.
   */
  async recordSuccess(
    input: RecordInput & {
      usage: TokenUsage;
      estimatedCostUsd: string;
      correlationId?: string;
      pricingDescription?: string;
    },
  ): Promise<void> {
    if (this.outbox && typeof this.ledger.recordSuccessTransaction === 'function') {
      try {
        const result = await this.ledger.recordSuccessTransaction({
          auth: input.auth,
          provider: input.provider,
          model: input.model,
          latencyMs: input.latencyMs,
          usage: input.usage,
          estimatedCostUsd: input.estimatedCostUsd,
          correlationId: input.correlationId,
          pricingDescription: input.pricingDescription,
        });
        void this.outbox.dispatchImmediately(
          result.outboxEventId,
          KAFKA_USAGE_TOPIC,
          result.event,
          input.auth.tenantId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to record transactional usage (tenantId=${input.auth.tenantId})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    } else {
      const requestId = await this.requests.recordSuccess(input);
      await this.writeLedgerEntry({
        tenantId: input.auth.tenantId,
        requestId,
        transactionType: 'AI_USAGE',
        amountUsd: chargeAmount(input.estimatedCostUsd),
        description: `${input.provider} ${input.model}`,
      });

      const event: UsageCompletedEvent = {
        requestId: requestId ?? '',
        tenantId: input.auth.tenantId,
        projectId: input.auth.projectId,
        provider: input.provider,
        model: input.model,
        requestTokens: input.usage.requestTokens,
        responseTokens: input.usage.responseTokens,
        totalTokens: input.usage.totalTokens,
        estimatedCost: input.estimatedCostUsd,
        latencyMs: Math.round(input.latencyMs),
        isEstimatedTokens: input.usage.isEstimatedTokens,
        timestamp: new Date().toISOString(),
      };
      void this.kafka.publish(KAFKA_USAGE_TOPIC, event, input.auth.tenantId);
    }

    recordAiSuccess(
      input.provider,
      input.model,
      { request: input.usage.requestTokens, response: input.usage.responseTokens },
      input.estimatedCostUsd,
      input.latencyMs,
    );
  }

  /**
   * A failed call: recorded in `ai_requests` (and outbox if provider failure).
   * Nothing is charged in ledger_entries.
   */
  async recordFailure(
    input: RecordInput & {
      requestTokens: number;
      errorKind: string;
      errorMessage: string;
      correlationId?: string;
    },
  ): Promise<void> {
    if (this.outbox && typeof this.ledger.recordFailureTransaction === 'function') {
      try {
        const result = await this.ledger.recordFailureTransaction({
          auth: input.auth,
          provider: input.provider,
          model: input.model,
          latencyMs: input.latencyMs,
          requestTokens: input.requestTokens,
          errorKind: input.errorKind,
          errorMessage: input.errorMessage,
          correlationId: input.correlationId,
        });
        if (result.outboxEventId && result.event) {
          void this.outbox.dispatchImmediately(
            result.outboxEventId,
            KAFKA_PROVIDER_TOPIC,
            result.event,
            input.auth.tenantId,
          );
          void this.alerts.create(
            input.auth.tenantId,
            'PROVIDER_ERROR',
            `${input.provider} ${input.model} failed: ${input.errorKind}.`,
            'WARNING',
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to record failure transaction (tenantId=${input.auth.tenantId})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    } else {
      const requestId = await this.requests.recordFailure(input);

      if (input.errorKind !== 'bad_request') {
        const event: ProviderFailedEvent = {
          requestId: requestId ?? '',
          tenantId: input.auth.tenantId,
          provider: input.provider,
          model: input.model,
          errorKind: input.errorKind,
          timestamp: new Date().toISOString(),
        };
        void this.kafka.publish(KAFKA_PROVIDER_TOPIC, event, input.auth.tenantId);
        void this.alerts.create(
          input.auth.tenantId,
          'PROVIDER_ERROR',
          `${input.provider} ${input.model} failed: ${input.errorKind}.`,
          'WARNING',
        );
      }
    }

    recordAiFailure(input.provider, input.model, input.errorKind);
  }

  /**
   * A manual change to a tenant's ledger: a credit, an adjustment, or a refund. Not reachable from any
   * endpoint yet — Phase 7 is request-driven usage tracking, not a billing or credit API — but the
   * ledger itself supports every transaction type the schema defines, for that to be added later without
   * a schema or repository change.
   */
  recordAdjustment(input: {
    tenantId: string;
    transactionType: Exclude<LedgerTransactionType, 'AI_USAGE'>;
    amountUsd: string;
    description?: string;
  }): Promise<void> {
    return this.writeLedgerEntry(input);
  }

  private async writeLedgerEntry(entry: {
    tenantId: string;
    requestId?: string;
    transactionType: LedgerTransactionType;
    amountUsd: string;
    description?: string;
  }): Promise<void> {
    try {
      await this.ledger.recordLedgerEntry(entry);
    } catch (error) {
      // The caller has already been served; a bookkeeping failure is logged loudly, not raised. The
      // Redis budget counters (the fast path) already reflect the spend regardless of this write.
      this.logger.error(
        `Failed to write ledger entry (tenantId=${entry.tenantId}, type=${entry.transactionType})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
