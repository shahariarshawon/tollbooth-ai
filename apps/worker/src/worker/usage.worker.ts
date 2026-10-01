import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import {
  KAFKA_PROVIDER_GROUP,
  KAFKA_PROVIDER_TOPIC,
  KAFKA_USAGE_GROUP,
  KAFKA_USAGE_TOPIC,
  KafkaService,
} from '@tollbooth/kafka';
import type { ProviderFailedEvent, UsageCompletedEvent } from '@tollbooth/kafka';

/**
 * Phase 8 foundation: consumes the two topics the gateway publishes and logs what arrived. Turning a
 * logged event into real work (usage rollups, budget alerts, a billing export) is a later phase; this
 * proves the pipe end to end first, which is all this phase asks for.
 */
@Injectable()
export class UsageWorker implements OnModuleInit {
  private readonly logger = new Logger(UsageWorker.name);

  constructor(private readonly kafka: KafkaService) {}

  async onModuleInit(): Promise<void> {
    await this.kafka.subscribe<UsageCompletedEvent>(KAFKA_USAGE_TOPIC, KAFKA_USAGE_GROUP, (event) =>
      this.onUsageCompleted(event),
    );
    await this.kafka.subscribe<ProviderFailedEvent>(
      KAFKA_PROVIDER_TOPIC,
      KAFKA_PROVIDER_GROUP,
      (event) => this.onProviderFailed(event),
    );
  }

  async onUsageCompleted(event: UsageCompletedEvent): Promise<void> {
    this.logger.log(
      `Received UsageCompleted: tenantId=${event.tenantId} provider=${event.provider} ` +
        `model=${event.model} tokens=${event.totalTokens} cost=${event.estimatedCost}`,
    );
  }

  async onProviderFailed(event: ProviderFailedEvent): Promise<void> {
    this.logger.log(
      `Received ProviderFailed: tenantId=${event.tenantId} provider=${event.provider} ` +
        `model=${event.model} errorKind=${event.errorKind}`,
    );
  }
}
