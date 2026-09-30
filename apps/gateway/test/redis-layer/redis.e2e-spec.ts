import { DEAD_REDIS, createRedisHarness } from '../support/redis-harness';
import type { RedisHarness } from '../support/redis-harness';
import { RedisKeys } from '../../src/redis/redis.constants';
import type { LuaScript } from '../../src/redis/redis.service';

describe('Redis connection (integration)', () => {
  describe('with Redis available', () => {
    let harness: RedisHarness;

    beforeAll(async () => {
      harness = await createRedisHarness();
    });
    afterAll(() => harness.close());

    it('connects successfully', () => {
      expect(harness.redis.client.status).toBe('ready');
    });

    it('answers a ping', async () => {
      await expect(harness.redis.client.ping()).resolves.toBe('PONG');
    });

    it('reports healthy with a latency', async () => {
      const health = await harness.redis.health();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(1);
      expect(health.latencyMs).toBeLessThan(500);
      expect(health.error).toBeUndefined();
    });

    it('runs a Lua script atomically and reuses it', async () => {
      const script: LuaScript = {
        name: 'testAddScript',
        keys: 1,
        lua: "return redis.call('INCRBY', KEYS[1], ARGV[1])",
      };
      const key = RedisKeys.tenantRequests(harness.tenantId(), 'test');

      await expect(harness.redis.run(script, [key], [5])).resolves.toBe(5);
      await expect(harness.redis.run(script, [key], [2])).resolves.toBe(7);
    });
  });

  describe('with Redis unreachable', () => {
    let harness: RedisHarness;

    beforeAll(async () => {
      // Startup waits a few seconds for Redis, gives up, and carries on.
      harness = await createRedisHarness(DEAD_REDIS);
    }, 15_000);
    afterAll(() => harness.close());

    it('does not stop the application from starting', () => {
      expect(harness.redis.client.status).not.toBe('ready');
    });

    it('reports unhealthy without leaking the address', async () => {
      const health = await harness.redis.health();
      expect(health.healthy).toBe(false);
      expect(health.error).toMatch(/not reachable|did not answer/i);
      expect(health.error).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|:1\b/);
    });

    it('fails commands immediately instead of queueing them', async () => {
      const started = Date.now();
      await expect(harness.redis.client.get('anything')).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(500);
    });

    it('fails scripts the same way', async () => {
      const script: LuaScript = { name: 'testDeadScript', keys: 0, lua: 'return 1' };
      await expect(harness.redis.run(script, [])).rejects.toThrow();
    });
  });
});
