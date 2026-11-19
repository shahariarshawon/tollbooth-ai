import { Module } from '@nestjs/common';
import { KafkaModule, parseBrokers } from '@tollbooth/kafka';
import { loadGatewayConfig } from '@tollbooth/config';
import { AlertModule } from '../alerts/alert.module';
import { RequestsModule } from '../requests/requests.module';
import { OutboxService } from './outbox.service';
import { UsageRepository } from './usage.repository';
import { UsageService } from './usage.service';

@Module({
  imports: [
    RequestsModule,
    AlertModule,
    KafkaModule.forRootAsync({
      useFactory: () => ({
        clientId: 'tollbooth-gateway',
        brokers: parseBrokers(loadGatewayConfig().KAFKA_BROKER),
      }),
    }),
  ],
  providers: [UsageRepository, OutboxService, UsageService],
  exports: [UsageService, OutboxService],
})
export class UsageModule {}
