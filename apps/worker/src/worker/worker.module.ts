import { Module } from '@nestjs/common';
import { loadConfig } from '@tollbooth/config';
import { KafkaModule, parseBrokers } from '@tollbooth/kafka';
import { UsageWorker } from './usage.worker';

@Module({
  imports: [
    KafkaModule.forRootAsync({
      useFactory: () => ({
        clientId: 'tollbooth-worker',
        brokers: parseBrokers(loadConfig().KAFKA_BROKER),
      }),
    }),
  ],
  providers: [UsageWorker],
})
export class WorkerModule {}
