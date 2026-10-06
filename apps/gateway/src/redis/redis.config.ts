import { Inject, Injectable } from '@nestjs/common';
import { resolveRedisSettings } from '@tollbooth/config';
import type { RedisSettings } from '@tollbooth/config';
import type { RedisOptions } from 'ioredis';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';

const CONNECT_TIMEOUT_MS = 5000;

/** Turns settings into ioredis options tuned for a request path: fail fast, reconnect forever. */
@Injectable()
export class RedisConfigService {
  readonly settings: RedisSettings;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.settings = resolveRedisSettings(config);
  }

  /** `host:port` for logs. Never includes credentials. */
  get address(): string {
    return `${this.settings.host}:${this.settings.port}`;
  }

  toClientOptions(): RedisOptions {
    const { host, port, username, password, tls, db, commandTimeoutMs } = this.settings;
    return {
      host,
      port,
      db,
      ...(username !== undefined && { username }),
      ...(password !== undefined && { password }),
      ...(tls && { tls: {} }),
      connectTimeout: CONNECT_TIMEOUT_MS,
      commandTimeout: commandTimeoutMs,
      keepAlive: 10_000,
      // While disconnected, commands fail immediately instead of queueing behind a dead connection.
      // The traffic controls then apply their failure policy right away.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      // Reconnect for as long as it takes, backing off from 200 ms up to 3 s between attempts.
      retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
      // After a failover the old primary answers READONLY; reconnecting finds the new one.
      reconnectOnError: (error) => (error.message.startsWith('READONLY') ? 2 : false),
    };
  }
}
