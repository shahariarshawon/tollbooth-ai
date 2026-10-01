import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/config.module';
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
export class RedisRateLimitStore implements RateLimitStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private readonly redis: Redis;
  private readonly memoryFallback = new InMemoryRateLimitStore();

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    let url = config.REDIS_URL;
    const isUpstash = url.includes('upstash.io');
    const useTls = config.REDIS_TLS || isUpstash || url.startsWith('rediss://');

    if (useTls && url.startsWith('redis://')) {
      url = url.replace('redis://', 'rediss://');
    }

    const options: RedisOptions = {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: config.REDIS_COMMAND_TIMEOUT_MS ?? 1000,
      ...(useTls ? { tls: {} } : {}),
    };

    // Fail fast instead of queueing commands while Redis is down: callers fail closed.
    this.redis = new Redis(url, options);
    // Connection errors surface on each command; this only stops unhandled-event noise.
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis connection error: ${err.message}. Using fallback in-memory rate limiting.`);
    });
  }

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

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
