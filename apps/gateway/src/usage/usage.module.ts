import { Module } from '@nestjs/common';
import { KafkaModule, parseBrokers } from '@tollbooth/kafka';
import { loadConfig } from '@tollbooth/config';
import { RequestsModule } from '../requests/requests.module';
import { UsageRepository } from './usage.repository';
import { UsageService } from './usage.service';

@Module({
  imports: [
    RequestsModule,
    KafkaModule.forRootAsync({
      useFactory: () => ({
        clientId: 'tollbooth-gateway',
        brokers: parseBrokers(loadConfig().KAFKA_BROKER),
      }),
    }),
  ],
  providers: [UsageRepository, UsageService],
  exports: [UsageService],
})
export class UsageModule {}
