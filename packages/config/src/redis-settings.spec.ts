import { loadControlPlaneConfig } from './control-plane';
import { resolveRedisSettings } from './redis-settings';
import type { RedisEnv } from './redis-settings';

const base: RedisEnv = {
  REDIS_URL: 'redis://localhost:6379',
  REDIS_TLS: false,
  REDIS_COMMAND_TIMEOUT_MS: 1000,
};

const env = (overrides: Partial<RedisEnv> = {}): RedisEnv => ({ ...base, ...overrides });

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

  it('always uses TLS for Upstash hosts, even from a plain redis:// URL', () => {
    expect(resolveRedisSettings(env({ REDIS_URL: 'redis://x.upstash.io:6379' })).tls).toBe(true);
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
    const settings = resolveRedisSettings({
      REDIS_HOST: 'redis.prod',
      ...env({ REDIS_URL: undefined }),
    });
    expect(settings.port).toBe(6379);
    expect('password' in settings).toBe(false);
  });

  it('carries the command timeout through', () => {
    expect(resolveRedisSettings(env({ REDIS_COMMAND_TIMEOUT_MS: 250 })).commandTimeoutMs).toBe(250);
  });

  it('refuses to guess when nothing is configured', () => {
    expect(() => resolveRedisSettings(env({ REDIS_URL: undefined }))).toThrow(/not configured/);
  });
});

// The Redis variables are shared by every service that uses Redis; they are exercised here through
// the control plane's schema.
describe('Redis environment variables', () => {
  const service = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'a-secret-that-is-at-least-32-chars-long',
  };
  const load = (redis: Record<string, string>) => loadControlPlaneConfig({ ...service, ...redis });

  it('requires an address: REDIS_URL, or REDIS_HOST', () => {
    expect(() => load({})).toThrow(/REDIS_URL/);
    expect(() => load({ REDIS_URL: '' })).toThrow(/REDIS_URL/);
    expect(() => load({ REDIS_HOST: 'redis.prod' })).not.toThrow();
    expect(() => load({ REDIS_URL: 'redis://localhost:6379' })).not.toThrow();
  });

  it('applies defaults', () => {
    const config = load({ REDIS_URL: 'redis://localhost:6379' });
    expect(config.REDIS_HOST).toBeUndefined();
    expect(config.REDIS_TLS).toBe(false);
    expect(config.REDIS_COMMAND_TIMEOUT_MS).toBe(1000);
  });

  it('treats blank values as unset, as .env.example ships them', () => {
    const config = load({
      REDIS_URL: 'redis://localhost:6379',
      REDIS_HOST: '',
      REDIS_PORT: '',
      REDIS_PASSWORD: '',
      REDIS_TLS: '',
    });
    expect(config.REDIS_HOST).toBeUndefined();
    expect(config.REDIS_PORT).toBeUndefined();
    expect(config.REDIS_TLS).toBe(false);
  });

  it('reads explicit values', () => {
    const config = load({
      REDIS_HOST: 'redis.prod',
      REDIS_PORT: '6390',
      REDIS_PASSWORD: 'secret',
      REDIS_TLS: 'true',
    });
    expect(config).toMatchObject({
      REDIS_HOST: 'redis.prod',
      REDIS_PORT: 6390,
      REDIS_PASSWORD: 'secret',
      REDIS_TLS: true,
    });
  });

  it('rejects a boolean that is not exactly true or false', () => {
    expect(() => load({ REDIS_URL: 'redis://x', REDIS_TLS: '1' })).toThrow(/REDIS_TLS/);
  });

  it('rejects out-of-range values', () => {
    expect(() => load({ REDIS_URL: 'redis://x', REDIS_PORT: '70000' })).toThrow(/REDIS_PORT/);
    expect(() => load({ REDIS_URL: 'redis://x', REDIS_COMMAND_TIMEOUT_MS: '5' })).toThrow(
      /REDIS_COMMAND_TIMEOUT_MS/,
    );
  });
});
