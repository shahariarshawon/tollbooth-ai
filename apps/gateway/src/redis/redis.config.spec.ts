import type { AppConfig } from '../config/config.module';
import { RedisConfigService } from './redis.config';

const base = {
  REDIS_URL: 'redis://localhost:6379',
  REDIS_TLS: false,
  REDIS_COMMAND_TIMEOUT_MS: 1000,
} as const;

const env = (overrides: Partial<AppConfig> = {}) => ({ ...base, ...overrides }) as AppConfig;

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
