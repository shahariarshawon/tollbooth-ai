import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService, type Prisma } from '@tollbooth/database';
import type { LedgerTransactionType, ProviderType } from '@tollbooth/database';
import { KAFKA_PROVIDER_TOPIC, KAFKA_USAGE_TOPIC } from '@tollbooth/kafka';
import type { ProviderFailedEvent, UsageCompletedEvent } from '@tollbooth/kafka';
import type { ApiKeyAuth } from '../common/types/gateway-request';
import type { TokenUsage } from '../providers/provider.interface';

export interface NewLedgerEntry {
  tenantId: string;
  /** The `ai_requests` row this entry is for, when there is one (a manual credit has none). */
  requestId?: string;
  transactionType: LedgerTransactionType;
  /**
   * USD, as a decimal string so no precision is lost. By the schema's convention: negative = a charge
   * to the tenant (`AI_USAGE`), positive = money added to their account (`CREDIT`, `REFUND`).
   */
  amountUsd: string;
  currency?: string;
  description?: string;
}

export interface RecordSuccessTxInput {
  auth: ApiKeyAuth;
  provider: ProviderType;
  model: string;
  latencyMs: number;
  usage: TokenUsage;
  estimatedCostUsd: string;
  correlationId?: string;
  pricingDescription?: string;
}

export interface RecordSuccessTxResult {
  requestId: string;
  outboxEventId: string;
  event: UsageCompletedEvent;
}

export interface RecordFailureTxInput {
  auth: ApiKeyAuth;
  provider: ProviderType;
  model: string;
  latencyMs: number;
  requestTokens: number;
  errorKind: string;
  errorMessage: string;
  correlationId?: string;
}

export interface RecordFailureTxResult {
  requestId: string;
  outboxEventId?: string;
  event?: ProviderFailedEvent;
}

/**
 * Handles all writes to `ledger_entries`, `ai_requests`, and `outbox_events`.
 * Operates in atomic PostgreSQL transactions to guarantee that request records,
 * financial ledgers, and Kafka outbox events never silently diverge.
 */
@Injectable()
export class UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes the successful request record, the AI_USAGE ledger entry, and the pending outbox event
   * in a single atomic database transaction.
   */
  async recordSuccessTransaction(input: RecordSuccessTxInput): Promise<RecordSuccessTxResult> {
    return this.prisma.$transaction(async (tx) => {
      const aiRequest = await tx.aiRequest.create({
        data: {
          tenantId: input.auth.tenantId,
          projectId: input.auth.projectId,
          apiKeyId: input.auth.apiKeyId,
          provider: input.provider,
          model: input.model,
          requestTokens: input.usage.requestTokens,
          responseTokens: input.usage.responseTokens,
          totalTokens: input.usage.totalTokens,
          latencyMs: Math.round(input.latencyMs),
          estimatedCost: input.estimatedCostUsd,
          status: 'SUCCESS',
          errorMessage: null,
        },
        select: { id: true },
      });

      const description = input.pricingDescription
        ? `${input.provider} ${input.model} ${input.pricingDescription}`
        : `${input.provider} ${input.model}`;

      await tx.ledgerEntry.create({
        data: {
          tenantId: input.auth.tenantId,
          requestId: aiRequest.id,
          transactionType: 'AI_USAGE',
          amount: chargeAmount(input.estimatedCostUsd),
          currency: 'USD',
          description,
        },
      });

      const outboxEventId = randomUUID();
      const event: UsageCompletedEvent = {
        eventId: outboxEventId,
        requestId: aiRequest.id,
        correlationId: input.correlationId,
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

      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          tenantId: input.auth.tenantId,
          topic: KAFKA_USAGE_TOPIC,
          eventKey: input.auth.tenantId,
          eventType: 'USAGE_COMPLETED',
          payload: event as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      return { requestId: aiRequest.id, outboxEventId, event };
    });
  }

  /**
   * Writes the failed request record and, for real provider failures (not caller bad_request),
   * a pending provider.failed event to the outbox table in one transaction.
   */
  async recordFailureTransaction(input: RecordFailureTxInput): Promise<RecordFailureTxResult> {
    return this.prisma.$transaction(async (tx) => {
      const aiRequest = await tx.aiRequest.create({
        data: {
          tenantId: input.auth.tenantId,
          projectId: input.auth.projectId,
          apiKeyId: input.auth.apiKeyId,
          provider: input.provider,
          model: input.model,
          requestTokens: input.requestTokens,
          responseTokens: 0,
          totalTokens: input.requestTokens,
          latencyMs: Math.round(input.latencyMs),
          estimatedCost: '0',
          status: 'FAILED',
          errorMessage: input.errorMessage.slice(0, 500),
        },
        select: { id: true },
      });

      if (input.errorKind === 'bad_request') {
        return { requestId: aiRequest.id };
      }

      const outboxEventId = randomUUID();
      const event: ProviderFailedEvent = {
        eventId: outboxEventId,
        requestId: aiRequest.id,
        correlationId: input.correlationId,
        tenantId: input.auth.tenantId,
        provider: input.provider,
        model: input.model,
        errorKind: input.errorKind,
        timestamp: new Date().toISOString(),
      };

      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          tenantId: input.auth.tenantId,
          topic: KAFKA_PROVIDER_TOPIC,
          eventKey: input.auth.tenantId,
          eventType: 'PROVIDER_FAILED',
          payload: event as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      return { requestId: aiRequest.id, outboxEventId, event };
    });
  }

  async recordLedgerEntry(entry: NewLedgerEntry): Promise<void> {
    await this.prisma.ledgerEntry.create({
      data: {
        tenantId: entry.tenantId,
        requestId: entry.requestId ?? null,
        transactionType: entry.transactionType,
        amount: entry.amountUsd,
        currency: entry.currency ?? 'USD',
        description: entry.description ?? null,
      },
    });
  }
}

/** `"0.00000500"` -> `"-0.00000500"`; `"0"` (and `"0.00000000"`) stay `"0"`, by the ledger's sign convention. */
export function chargeAmount(costUsd: string): string {
  return Number(costUsd) === 0 ? '0' : `-${costUsd.replace(/^-/, '')}`;
}
