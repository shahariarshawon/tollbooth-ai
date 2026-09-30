import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/config.module';
import type { RateLimitHit, RateLimitStore } from './rate-limit.store';

// One script so the counter and its expiry can never be split by a crash, which would leave a
// counter with no TTL and lock the client out for good.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

@Injectable()
export class RedisRateLimitStore implements RateLimitStore, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // Fail fast instead of queueing commands while Redis is down: callers fail closed.
    this.redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // Connection errors surface on each command; this only stops unhandled-event noise.
    this.redis.on('error', () => undefined);
  }

  async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const [count, ttl] = (await this.redis.eval(HIT_SCRIPT, 1, key, windowSeconds)) as [
      number,
      number,
    ];
    return { count, ttlSeconds: ttl > 0 ? ttl : windowSeconds };
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
