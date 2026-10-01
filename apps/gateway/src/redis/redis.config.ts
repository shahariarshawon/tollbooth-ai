import { Inject, Injectable } from '@nestjs/common';
import type { RedisOptions } from 'ioredis';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';

export interface RedisSettings {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls: boolean;
  db: number;
  commandTimeoutMs: number;
}

type RedisEnv = Pick<
  AppConfig,
  | 'REDIS_URL'
  | 'REDIS_HOST'
  | 'REDIS_PORT'
  | 'REDIS_PASSWORD'
  | 'REDIS_TLS'
  | 'REDIS_COMMAND_TIMEOUT_MS'
>;

/**
 * Works out the connection from the environment. Discrete values win when REDIS_HOST is set (how most
 * managed Redis services hand out credentials); otherwise REDIS_URL is used, which also carries
 * username, password, database and TLS (`rediss://`).
 */
export function resolveRedisSettings(env: RedisEnv): RedisSettings {
  if (env.REDIS_HOST) {
    return {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT ?? 6379,
      ...(env.REDIS_PASSWORD !== undefined && { password: env.REDIS_PASSWORD }),
      tls: env.REDIS_TLS,
      db: 0,
      commandTimeoutMs: env.REDIS_COMMAND_TIMEOUT_MS,
    };
  }

  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    tls: url.protocol === 'rediss:' || env.REDIS_TLS || url.hostname.includes('upstash.io'),
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) || 0 : 0,
    commandTimeoutMs: env.REDIS_COMMAND_TIMEOUT_MS,
  };
}

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
