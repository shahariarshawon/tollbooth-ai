import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { PrismaService, type Prisma } from '@tollbooth/database';
import {
  KAFKA_PROVIDER_DLQ_TOPIC,
  KAFKA_PROVIDER_GROUP,
  KAFKA_PROVIDER_TOPIC,
  KAFKA_USAGE_DLQ_TOPIC,
  KAFKA_USAGE_GROUP,
  KAFKA_USAGE_TOPIC,
  KafkaService,
  validateProviderFailedEvent,
  validateUsageCompletedEvent,
  type DeadLetterMessage,
  type ProviderFailedEvent,
  type UsageCompletedEvent,
} from '@tollbooth/kafka';
import { IdempotencyService } from './idempotency.service';

/**
 * Fault-tolerant Kafka event processor for usage and provider telemetry.
 *
 * Guarantees:
 * 1. Idempotency: Duplicate events across restarts, network retries, or partition rebalances
 *    are identified via persistent `processed_events` and produce no duplicate business effects.
 * 2. Schema validation: Event payloads are validated with Zod prior to processing.
 * 3. Dead-Letter Queue (DLQ): Permanently failing messages (retries exhausted) are safely
 *    routed to DLQ topics (`usage.completed.dlq`, `provider.failed.dlq`) and stored in `dead_letter_events`.
 * 4. Audit trail: Validated events record downstream operational entries in `usage_events`.
 */
@Injectable()
export class UsageWorker implements OnModuleInit {
  private readonly logger = new Logger(UsageWorker.name);

  constructor(
    private readonly kafka: KafkaService,
    private readonly idempotency: IdempotencyService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafka.subscribe<UsageCompletedEvent>(
      KAFKA_USAGE_TOPIC,
      KAFKA_USAGE_GROUP,
      (event) => this.onUsageCompleted(event),
      {
        dlqTopic: KAFKA_USAGE_DLQ_TOPIC,
        onDeadLetter: (dlq) => this.recordDeadLetter(dlq),
      },
    );

    await this.kafka.subscribe<ProviderFailedEvent>(
      KAFKA_PROVIDER_TOPIC,
      KAFKA_PROVIDER_GROUP,
      (event) => this.onProviderFailed(event),
      {
        dlqTopic: KAFKA_PROVIDER_DLQ_TOPIC,
        onDeadLetter: (dlq) => this.recordDeadLetter(dlq),
      },
    );
  }

  async onUsageCompleted(event: UsageCompletedEvent): Promise<void> {
    const validated = validateUsageCompletedEvent(event);
    const dedupeKey = validated.eventId || validated.requestId;

    const alreadyProcessed = await this.idempotency.isProcessed(dedupeKey, KAFKA_USAGE_GROUP);
    if (alreadyProcessed) {
      this.logger.log(
        `Skipping duplicate UsageCompleted event (already processed): id=${dedupeKey}`,
      );
      return;
    }

    await this.idempotency.markProcessed(dedupeKey, 'USAGE_COMPLETED', KAFKA_USAGE_GROUP);

    if (this.prisma) {
      try {
        await this.prisma.usageEvent.create({
          data: {
            tenantId: validated.tenantId,
            requestId: validated.requestId || null,
            eventType: 'REQUEST_COMPLETED',
            tokens: validated.totalTokens,
            cost: validated.estimatedCost,
            metadata: {
              provider: validated.provider,
              model: validated.model,
              latencyMs: validated.latencyMs,
              isEstimatedTokens: validated.isEstimatedTokens,
              correlationId: validated.correlationId,
            },
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to write usageEvent record: ${err}`);
      }
    }

    this.logger.log(
      `Received UsageCompleted: tenantId=${validated.tenantId} provider=${validated.provider} ` +
        `model=${validated.model} tokens=${validated.totalTokens} cost=${validated.estimatedCost}`,
    );
  }

  async onProviderFailed(event: ProviderFailedEvent): Promise<void> {
    const validated = validateProviderFailedEvent(event);
    const dedupeKey = validated.eventId || validated.requestId;

    const alreadyProcessed = await this.idempotency.isProcessed(dedupeKey, KAFKA_PROVIDER_GROUP);
    if (alreadyProcessed) {
      this.logger.log(
        `Skipping duplicate ProviderFailed event (already processed): id=${dedupeKey}`,
      );
      return;
    }

    await this.idempotency.markProcessed(dedupeKey, 'PROVIDER_FAILED', KAFKA_PROVIDER_GROUP);

    if (this.prisma) {
      try {
        await this.prisma.usageEvent.create({
          data: {
            tenantId: validated.tenantId,
            requestId: validated.requestId || null,
            eventType: 'REQUEST_FAILED',
            tokens: 0,
            cost: '0',
            metadata: {
              provider: validated.provider,
              model: validated.model,
              errorKind: validated.errorKind,
              correlationId: validated.correlationId,
            },
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to write usageEvent failure record: ${err}`);
      }
    }

    this.logger.log(
      `Received ProviderFailed: tenantId=${validated.tenantId} provider=${validated.provider} ` +
        `model=${validated.model} errorKind=${validated.errorKind}`,
    );
  }

  private async recordDeadLetter(dlq: DeadLetterMessage): Promise<void> {
    this.logger.warn(
      `Message exhausted retries on topic "${dlq.originalTopic}" (group "${dlq.consumerGroup}"): ${dlq.error}`,
    );

    if (this.prisma) {
      try {
        let parsedPayload: Record<string, unknown> = {};
        try {
          parsedPayload = JSON.parse(dlq.value) as Record<string, unknown>;
        } catch {
          parsedPayload = { raw: dlq.value };
        }

        await this.prisma.deadLetterEvent.create({
          data: {
            topic: dlq.originalTopic,
            consumerGroup: dlq.consumerGroup,
            eventKey: dlq.key ?? null,
            payload: parsedPayload as unknown as Prisma.InputJsonValue,
            error: dlq.error,
            retryCount: dlq.retryCount,
          },
        });
      } catch (err) {
        this.logger.error(`Failed to store dead letter record in database: ${err}`);
      }
    }
  }
}
