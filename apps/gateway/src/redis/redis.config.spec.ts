import type { AppConfig } from '../config/config.module';
import { RedisConfigService, resolveRedisSettings } from './redis.config';

const base = {
  REDIS_URL: 'redis://localhost:6379',
  REDIS_TLS: false,
  REDIS_COMMAND_TIMEOUT_MS: 1000,
} as const;

const env = (overrides: Partial<AppConfig> = {}) => ({ ...base, ...overrides }) as AppConfig;

describe('resolveRedisSettings', () => {
  it('reads host and port from REDIS_URL', () => {
    expect(resolveRedisSettings(env({ REDIS_URL: 'redis://cache.internal:6380' }))).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      db: 0,
      tls: false,
    });
  });

  it('defaults the port and understands credentials, database and TLS in the URL', () => {
    const settings = resolveRedisSettings(
      env({ REDIS_URL: 'rediss://app:p%40ss%2Fword@cache.example.com/3' }),
    );
    expect(settings).toMatchObject({
      host: 'cache.example.com',
      port: 6379,
      username: 'app',
      password: 'p@ss/word',
      db: 3,
      tls: true,
    });
  });

  it('prefers REDIS_HOST, REDIS_PORT and REDIS_PASSWORD when REDIS_HOST is set', () => {
    const settings = resolveRedisSettings(
      env({
        REDIS_URL: 'redis://ignored:1111',
        REDIS_HOST: 'redis.prod',
        REDIS_PORT: 6390,
        REDIS_PASSWORD: 'secret',
        REDIS_TLS: true,
      }),
    );
    expect(settings).toEqual({
      host: 'redis.prod',
      port: 6390,
      password: 'secret',
      tls: true,
      db: 0,
      commandTimeoutMs: 1000,
    });
  });

  it('defaults the port to 6379 in host mode and omits an absent password', () => {
    const settings = resolveRedisSettings(env({ REDIS_HOST: 'redis.prod' }));
    expect(settings.port).toBe(6379);
    expect('password' in settings).toBe(false);
  });

  it('carries the command timeout through', () => {
    expect(resolveRedisSettings(env({ REDIS_COMMAND_TIMEOUT_MS: 250 })).commandTimeoutMs).toBe(250);
  });
});

describe('RedisConfigService', () => {
  const service = new RedisConfigService(
    env({ REDIS_HOST: 'redis.prod', REDIS_PASSWORD: 'hunter2', REDIS_TLS: true }),
  );

  it('builds client options that fail fast and keep reconnecting', () => {
    const options = service.toClientOptions();
    expect(options).toMatchObject({
      host: 'redis.prod',
      port: 6379,
      password: 'hunter2',
      tls: {},
      enableOfflineQueue: false,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
    });
  });

  it('backs off between reconnect attempts up to a ceiling, and never gives up', () => {
    const { retryStrategy } = service.toClientOptions();
    expect(retryStrategy?.(1)).toBe(200);
    expect(retryStrategy?.(5)).toBe(1000);
    expect(retryStrategy?.(100)).toBe(3000);
  });

  it('reconnects after a failover (READONLY) and not for other errors', () => {
    const { reconnectOnError } = service.toClientOptions();
    expect(
      reconnectOnError?.(new Error('READONLY You can not write against a read only replica')),
    ).toBe(2);
    expect(reconnectOnError?.(new Error('WRONGTYPE'))).toBe(false);
  });

  it('exposes an address for logs that never contains the password', () => {
    expect(service.address).toBe('redis.prod:6379');
    expect(service.address).not.toContain('hunter2');
  });
});
