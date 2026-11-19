import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { GatewayCacheService } from './gateway-cache.service';

@Module({
  imports: [RedisModule],
  providers: [GatewayCacheService],
  exports: [GatewayCacheService],
})
export class CacheModule {}
