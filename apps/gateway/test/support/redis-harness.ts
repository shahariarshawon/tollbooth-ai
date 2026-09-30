import { loadConfig } from '@tollbooth/config';
import type { AppConfig } from '@tollbooth/config';
import { randomUUID } from 'node:crypto';
import { RedisConfigService } from '../../src/redis/redis.config';
import { RedisFailurePolicy } from '../../src/redis/redis-failure.policy';
import { RedisService } from '../../src/redis/redis.service';

export interface RedisHarness {
  config: AppConfig;
  redis: RedisService;
  policy: RedisFailurePolicy;
  /** A fresh tenant id. Keys for it are deleted in close(), so suites never see each other's data. */
  tenantId: () => string;
  /** A fresh provider name, for the same reason. */
  providerName: () => string;
  close: () => Promise<void>;
}

/**
 * The real RedisService against the real Redis, without starting the whole application. Overrides
 * change the configuration, for example to point at a port where nothing listens.
 */
export async function createRedisHarness(
  overrides: Partial<AppConfig> = {},
): Promise<RedisHarness> {
  const config: AppConfig = { ...loadConfig(), ...overrides };
  const redis = new RedisService(new RedisConfigService(config));
  await redis.onModuleInit();

  const tenants: string[] = [];
  const providers: string[] = [];

  return {
    config,
    redis,
    policy: new RedisFailurePolicy(config),
    tenantId: () => {
      const id = randomUUID();
      tenants.push(id);
      return id;
    },
    providerName: () => {
      const name = `testprov-${randomUUID().slice(0, 8)}`;
      providers.push(name);
      return name;
    },
    close: async () => {
      if (redis.client.status === 'ready') {
        const patterns = [
          ...tenants.map((id) => `tenant:{${id}}:*`),
          ...providers.map((name) => `provider:${name}:circuit`),
        ];
        for (const pattern of patterns) {
          const keys = await redis.client.keys(pattern);
          if (keys.length > 0) await redis.client.del(...keys);
        }
      }
      await redis.onModuleDestroy();
    },
  };
}

/** A configuration that points at a Redis that is not there. */
export const DEAD_REDIS: Partial<AppConfig> = { REDIS_HOST: '127.0.0.1', REDIS_PORT: 1 };
