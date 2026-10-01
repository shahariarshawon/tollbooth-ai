import { Injectable, Logger } from '@nestjs/common';
import type { LedgerTransactionType } from '@tollbooth/database';
import { KAFKA_PROVIDER_TOPIC, KAFKA_USAGE_TOPIC, KafkaService } from '@tollbooth/kafka';
import type { ProviderFailedEvent, UsageCompletedEvent } from '@tollbooth/kafka';
import { AlertService } from '../alerts/alert.service';
import { recordAiFailure, recordAiSuccess } from '../metrics/metrics';
import type { RecordInput } from '../requests/request.service';
import { RequestService } from '../requests/request.service';
import type { TokenUsage } from '../requests/request.service';
import { UsageRepository } from './usage.repository';

/**
 * Pipeline step 9, in full: record what happened (`ai_requests`, via `RequestService`, unchanged from
 * earlier phases), what it cost (`ledger_entries`, Phase 7), and announce it on Kafka (Phase 8) for
 * whatever consumes it next (today, just the worker logging that it arrived).
 *
 * Token counting (`TokenCounter`) and cost calculation (`budget/cost-estimator.ts`) already happen
 * upstream, in the provider and in `TrafficControlService.complete`, the same provider-independent way
 * for every provider; this service only files the record of the outcome. It is the one thing
 * `GatewayService` calls after a request finishes, so it never has to remember to do all three.
 *
 * The Kafka publish is fire-and-forget (not awaited): it must never add latency or a new way to fail to
 * a request that has already been decided. `KafkaService.publish` already never throws, so this is safe
 * even unawaited; see `@tollbooth/kafka`.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly requests: RequestService,
    private readonly ledger: UsageRepository,
    private readonly kafka: KafkaService,
    private readonly alerts: AlertService,
  ) {}

  /**
   * A successful call: the `ai_requests` row, then an `AI_USAGE` ledger entry for what it actually cost
   * (0 on a free tier — recorded all the same, so free-tier usage leaves the same audit trail as paid
   * usage; see Task 8), then a `usage.completed` event. The ledger entry is still written even if the
   * `ai_requests` row failed to save, just without a `requestId` to link, because the money (or
   * free-tier usage) still happened; the event carries that same (possibly absent) id.
   */
  async recordSuccess(
    input: RecordInput & { usage: TokenUsage; estimatedCostUsd: string },
  ): Promise<void> {
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
      timestamp: new Date().toISOString(),
    };
    void this.kafka.publish(KAFKA_USAGE_TOPIC, event, input.auth.tenantId);
    recordAiSuccess(
      input.provider,
      input.model,
      { request: input.usage.requestTokens, response: input.usage.responseTokens },
      input.estimatedCostUsd,
      input.latencyMs,
    );
  }

  /**
   * A failed call: recorded for the audit trail. Nothing is charged, because `TrafficControlService`
   * already released whatever budget was held for it before this is called, so there is no ledger entry.
   * A `provider.failed` event is published for a real provider failure (`errorKind` is not
   * `bad_request`): that is what counts against the provider everywhere else in the system too (the
   * circuit breaker), so it is the same definition of "failed" here.
   */
  async recordFailure(
    input: RecordInput & { requestTokens: number; errorKind: string; errorMessage: string },
  ): Promise<void> {
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

/** `"0.00000500"` -> `"-0.00000500"`; `"0"` (and `"0.00000000"`) stay `"0"`, by the ledger's sign convention. */
function chargeAmount(costUsd: string): string {
  return Number(costUsd) === 0 ? '0' : `-${costUsd.replace(/^-/, '')}`;
}
