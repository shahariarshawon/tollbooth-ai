import { Module } from '@nestjs/common';
import { loadWorkerConfig } from '@tollbooth/config';
import { DatabaseModule } from '@tollbooth/database';
import { KafkaModule, parseBrokers } from '@tollbooth/kafka';
import { IdempotencyService } from './idempotency.service';
import { UsageWorker } from './usage.worker';

@Module({
  imports: [
    DatabaseModule,
    KafkaModule.forRootAsync({
      useFactory: () => ({
        clientId: 'tollbooth-worker',
        brokers: parseBrokers(loadWorkerConfig().KAFKA_BROKER),
      }),
    }),
  ],
  providers: [IdempotencyService, UsageWorker],
})
export class WorkerModule {}
