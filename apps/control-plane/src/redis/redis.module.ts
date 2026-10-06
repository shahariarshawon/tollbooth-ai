import { Global, Inject, Logger, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { resolveRedisSettings } from '@tollbooth/config';
import Redis from 'ioredis';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const CONNECT_TIMEOUT_MS = 5000;

/**
 * The control plane's one Redis connection, shared by the rate limiter and the provider-circuit reader.
 * It fails fast instead of queueing commands while Redis is down, so a Redis outage degrades the callers
 * (see their own fallbacks) rather than stalling requests.
 */
function createRedis(config: AppConfig): Redis {
  const { host, port, username, password, tls, db, commandTimeoutMs } =
    resolveRedisSettings(config);
  const logger = new Logger('Redis');
  const redis = new Redis({
    host,
    port,
    db,
    ...(username !== undefined && { username }),
    ...(password !== undefined && { password }),
    ...(tls && { tls: {} }),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: commandTimeoutMs,
  });
  // Connection errors also surface on each command; this only stops unhandled-event noise.
  redis.on('error', (error) => logger.warn(`Redis connection error: ${error.message}`));
  return redis;
}

@Global()
@Module({
  providers: [{ provide: REDIS_CLIENT, inject: [APP_CONFIG], useFactory: createRedis }],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
