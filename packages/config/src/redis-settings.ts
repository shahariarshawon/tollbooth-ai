/** What a service needs to open a Redis connection, resolved from the environment. */
export interface RedisSettings {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls: boolean;
  db: number;
  commandTimeoutMs: number;
}

export interface RedisEnv {
  REDIS_URL?: string | undefined;
  REDIS_HOST?: string | undefined;
  REDIS_PORT?: number | undefined;
  REDIS_PASSWORD?: string | undefined;
  REDIS_TLS: boolean;
  REDIS_COMMAND_TIMEOUT_MS: number;
}

const DEFAULT_REDIS_PORT = 6379;

/**
 * Works out the connection from the environment. Discrete values win when REDIS_HOST is set (how most
 * managed Redis services hand out credentials); otherwise REDIS_URL is used, which also carries
 * username, password, database and TLS (`rediss://`). Upstash hosts always use TLS.
 */
export function resolveRedisSettings(env: RedisEnv): RedisSettings {
  if (env.REDIS_HOST) {
    return {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT ?? DEFAULT_REDIS_PORT,
      ...(env.REDIS_PASSWORD !== undefined && { password: env.REDIS_PASSWORD }),
      tls: env.REDIS_TLS,
      db: 0,
      commandTimeoutMs: env.REDIS_COMMAND_TIMEOUT_MS,
    };
  }

  if (!env.REDIS_URL) throw new Error('Redis is not configured: set REDIS_URL or REDIS_HOST');
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : DEFAULT_REDIS_PORT,
    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    tls: url.protocol === 'rediss:' || env.REDIS_TLS || url.hostname.includes('upstash.io'),
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) || 0 : 0,
    commandTimeoutMs: env.REDIS_COMMAND_TIMEOUT_MS,
  };
}
