import { Module } from '@nestjs/common';
import { ApiKeyModule } from '../api-key/api-key.module';
import { ProvidersModule } from '../providers/providers.module';
import { RequestsModule } from '../requests/requests.module';
import { TokensModule } from '../tokens/tokens.module';
import { TrafficModule } from '../traffic/traffic.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  imports: [ApiKeyModule, ProvidersModule, RequestsModule, TokensModule, TrafficModule],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}
