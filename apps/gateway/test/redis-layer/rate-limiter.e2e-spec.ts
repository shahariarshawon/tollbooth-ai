import { randomUUID } from 'node:crypto';
import { RedisKeys, minuteBucket } from '../../src/redis/redis.constants';
import { RateLimiterService } from '../../src/traffic/rate-limiter.service';
import { WindowCounter } from '../../src/traffic/window-counter';
import { DEAD_REDIS, createRedisHarness } from '../support/redis-harness';
import type { RedisHarness } from '../support/redis-harness';

const NOW = new Date('2026-10-01T09:30:10.000Z');
const LIMITS = { tenantRequests: 5, keyRequests: 3 };

describe('Request rate limiting (integration)', () => {
  let harness: RedisHarness;
  let limiter: RateLimiterService;

  beforeAll(async () => {
    harness = await createRedisHarness();
    limiter = new RateLimiterService(new WindowCounter(harness.redis), harness.policy);
  });
  afterAll(() => harness.close());

  const caller = () => ({ tenantId: harness.tenantId(), apiKeyId: randomUUID() });

  it('allows requests within the limit and counts down what is left', async () => {
    const auth = caller();
    const remaining: number[] = [];
    for (let i = 0; i < 3; i++) {
      const decision = await limiter.check(auth, LIMITS, NOW);
      expect(decision.allowed).toBe(true);
      expect(decision.scope).toBeNull();
      remaining.push(decision.remaining);
    }
    // The key limit (3) is tighter than the tenant limit (5), so that is the one reported.
    expect(remaining).toEqual([2, 1, 0]);
  });

  it('blocks the request that exceeds the API key limit', async () => {
    const auth = caller();
    for (let i = 0; i < 3; i++) await limiter.check(auth, LIMITS, NOW);

    const blocked = await limiter.check(auth, LIMITS, NOW);
    expect(blocked).toMatchObject({ allowed: false, scope: 'key', limit: 3, remaining: 0 });
    expect(blocked.resetSeconds).toBe(50);
  });

  it('blocks on the tenant limit when its keys together exceed it', async () => {
    const tenantId = harness.tenantId();
    const keys = [randomUUID(), randomUUID()];
    // Two keys with 3 requests each allowed: 6 requests would fit the keys, but the tenant allows 5.
    const decisions = [];
    for (const apiKeyId of [keys[0]!, keys[1]!, keys[0]!, keys[1]!, keys[0]!, keys[1]!]) {
      decisions.push(await limiter.check({ tenantId, apiKeyId }, LIMITS, NOW));
    }
    expect(decisions.slice(0, 5).every((d) => d.allowed)).toBe(true);
    expect(decisions[5]).toMatchObject({ allowed: false, scope: 'tenant', limit: 5 });
  });

  it('keeps tenants independent of each other', async () => {
    const a = caller();
    const b = caller();
    for (let i = 0; i < 4; i++) await limiter.check(a, LIMITS, NOW);

    expect((await limiter.check(a, LIMITS, NOW)).allowed).toBe(false);
    expect((await limiter.check(b, LIMITS, NOW)).allowed).toBe(true);
  });

  it('does not count refused requests, so a blocked caller is not punished further', async () => {
    const auth = caller();
    for (let i = 0; i < 10; i++) await limiter.check(auth, LIMITS, NOW);

    const minute = minuteBucket(NOW);
    const tenantCount = await harness.redis.client.get(
      RedisKeys.tenantRequests(auth.tenantId, minute),
    );
    const keyCount = await harness.redis.client.get(
      RedisKeys.apiKeyRequests(auth.tenantId, auth.apiKeyId, minute),
    );
    expect(keyCount).toBe('3');
    expect(tenantCount).toBe('3');
  });

  it('is exact under concurrency: a burst can never get past the limit', async () => {
    const auth = caller();
    const limits = { tenantRequests: 1000, keyRequests: 20 };

    const decisions = await Promise.all(
      Array.from({ length: 100 }, () => limiter.check(auth, limits, NOW)),
    );

    expect(decisions.filter((d) => d.allowed)).toHaveLength(20);
    expect(decisions.filter((d) => !d.allowed)).toHaveLength(80);
    const stored = await harness.redis.client.get(
      RedisKeys.apiKeyRequests(auth.tenantId, auth.apiKeyId, minuteBucket(NOW)),
    );
    expect(stored).toBe('20');
  });

  it('starts a fresh count in the next minute', async () => {
    const auth = caller();
    for (let i = 0; i < 4; i++) await limiter.check(auth, LIMITS, NOW);
    expect((await limiter.check(auth, LIMITS, NOW)).allowed).toBe(false);

    const nextMinute = new Date(NOW.getTime() + 60_000);
    const decision = await limiter.check(auth, LIMITS, nextMinute);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(2);
  });

  it('stores counters under per-minute keys that expire', async () => {
    const auth = caller();
    const now = new Date();
    await limiter.check(auth, LIMITS, now);

    const key = RedisKeys.tenantRequests(auth.tenantId, minuteBucket(now));
    expect(key).toMatch(new RegExp(`^tenant:\\{${auth.tenantId}\\}:requests:\\d{12}$`));
    const ttl = await harness.redis.client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    const keyTtl = await harness.redis.client.ttl(
      RedisKeys.apiKeyRequests(auth.tenantId, auth.apiKeyId, minuteBucket(now)),
    );
    expect(keyTtl).toBeGreaterThan(0);
  });

  it('never leaves a counter without an expiry', async () => {
    const auth = caller();
    const now = new Date();
    await Promise.all(Array.from({ length: 30 }, () => limiter.check(auth, LIMITS, now)));

    const ttl = await harness.redis.client.ttl(
      RedisKeys.tenantRequests(auth.tenantId, minuteBucket(now)),
    );
    expect(ttl).toBeGreaterThan(0);
  });

  describe('when Redis is down', () => {
    let dead: RedisHarness;
    beforeAll(async () => {
      dead = await createRedisHarness(DEAD_REDIS);
    }, 15_000);
    afterAll(() => dead.close());

    it('fails closed by default with a 503', async () => {
      const closed = new RateLimiterService(new WindowCounter(dead.redis), dead.policy);
      await expect(closed.check(caller(), LIMITS, NOW)).rejects.toMatchObject({
        status: 503,
        payload: { code: 'traffic_control_unavailable' },
      });
    });

    it('lets the request through, marked as bypassed, when configured to fail open', async () => {
      const open = await createRedisHarness({ ...DEAD_REDIS, GATEWAY_FAIL_OPEN: true });
      try {
        const decision = await new RateLimiterService(
          new WindowCounter(open.redis),
          open.policy,
        ).check(caller(), LIMITS, NOW);
        expect(decision).toMatchObject({ allowed: true, bypassed: true });
      } finally {
        await open.close();
      }
    }, 15_000);
  });
});
