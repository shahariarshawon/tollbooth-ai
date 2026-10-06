import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import type { RateLimitHit, RateLimitStore } from './rate-limit.store';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store';

// One script so the counter and its expiry can never be split by a crash, which would leave a
// counter with no TTL and lock the client out for good.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

@Injectable()
export class RedisRateLimitStore implements RateLimitStore {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private readonly memoryFallback = new InMemoryRateLimitStore();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    try {
      const [count, ttl] = (await this.redis.eval(HIT_SCRIPT, 1, key, windowSeconds)) as [
        number,
        number,
      ];
      return { count, ttlSeconds: ttl > 0 ? ttl : windowSeconds };
    } catch (error) {
      this.logger.warn(
        `Redis rate limit check failed (${error instanceof Error ? error.message : String(error)}). Falling back to in-memory store.`,
      );
      return this.memoryFallback.hit(key, windowSeconds);
    }
  }
}
