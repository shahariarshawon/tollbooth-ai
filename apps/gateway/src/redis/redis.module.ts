import { Global, Module } from '@nestjs/common';
import { RedisConfigService } from './redis.config';
import { RedisFailurePolicy } from './redis-failure.policy';
import { RedisHealthController } from './redis-health.controller';
import { RedisService } from './redis.service';

@Global()
@Module({
  controllers: [RedisHealthController],
  providers: [RedisConfigService, RedisService, RedisFailurePolicy],
  exports: [RedisService, RedisFailurePolicy],
})
export class RedisModule {}
