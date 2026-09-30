import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { DatabaseModule } from '@tollbooth/database';
import { OpenAiErrorFilter } from './common/filters/openai-error.filter';
import { createValidationPipe } from './common/pipes/create-validation-pipe';
import { ConfigModule } from './config/config.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule, DatabaseModule, GatewayModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: OpenAiErrorFilter },
    { provide: APP_PIPE, useValue: createValidationPipe() },
  ],
})
export class AppModule {}
