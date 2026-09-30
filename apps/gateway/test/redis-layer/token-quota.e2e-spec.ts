import { randomUUID } from 'node:crypto';
import { RedisKeys, minuteBucket } from '../../src/redis/redis.constants';
import { TokenQuotaService } from '../../src/traffic/token-quota.service';
import { WindowCounter } from '../../src/traffic/window-counter';
import { setLogSink } from '../../src/common/logging/structured-logger';
import { DEAD_REDIS, createRedisHarness } from '../support/redis-harness';
import type { RedisHarness } from '../support/redis-harness';

const NOW = new Date('2026-10-01T09:30:10.000Z');
const LIMITS = { tenantTokens: 1000, keyTokens: 600 };

describe('Token quota (integration)', () => {
  let harness: RedisHarness;
  let quota: TokenQuotaService;

  beforeAll(async () => {
    harness = await createRedisHarness();
    quota = new TokenQuotaService(new WindowCounter(harness.redis), harness.policy);
  });
  afterAll(() => harness.close());
  afterEach(() => setLogSink(null));

  const caller = () => ({ tenantId: harness.tenantId(), apiKeyId: randomUUID() });
  const minute = minuteBucket(NOW);
  const read = async (key: string) => Number((await harness.redis.client.get(key)) ?? 0);

  it('tracks tokens against both the tenant and the API key', async () => {
    const auth = caller();
    const reservation = await quota.reserve(auth, LIMITS, 250, {}, NOW);

    expect(reservation).not.toBeNull();
    expect(await read(RedisKeys.tenantTokens(auth.tenantId, minute))).toBe(250);
    expect(await read(RedisKeys.apiKeyTokens(auth.tenantId, auth.apiKeyId, minute))).toBe(250);

    await quota.reserve(auth, LIMITS, 100, {}, NOW);
    expect(await read(RedisKeys.tenantTokens(auth.tenantId, minute))).toBe(350);
  });

  it('corrects the estimate to the real usage once the call is done', async () => {
    const auth = caller();
    const reservation = await quota.reserve(auth, LIMITS, 500, {}, NOW);
    await quota.commit(reservation, 120);

    expect(await read(RedisKeys.tenantTokens(auth.tenantId, minute))).toBe(120);
    expect(await read(RedisKeys.apiKeyTokens(auth.tenantId, auth.apiKeyId, minute))).toBe(120);
  });

  it('charges more when the real usage turned out higher than the estimate', async () => {
    const auth = caller();
    const reservation = await quota.reserve(auth, LIMITS, 100, {}, NOW);
    await quota.commit(reservation, 180);
    expect(await read(RedisKeys.tenantTokens(auth.tenantId, minute))).toBe(180);
  });

  it('gives the tokens back when the call failed', async () => {
    const auth = caller();
    const reservation = await quota.reserve(auth, LIMITS, 400, {}, NOW);
    await quota.release(reservation);
    expect(await read(RedisKeys.tenantTokens(auth.tenantId, minute))).toBe(0);
    expect(await read(RedisKeys.apiKeyTokens(auth.tenantId, auth.apiKeyId, minute))).toBe(0);
  });

  it('never lets a counter go below zero', async () => {
    const auth = caller();
    const reservation = await quota.reserve(auth, LIMITS, 100, {}, NOW);
    await quota.release(reservation);
    await quota.release(reservation);
    expect(await read(RedisKeys.tenantTokens(auth.tenantId, minute))).toBe(0);
  });

  it('rejects a request that would exceed the API key quota, and changes nothing', async () => {
    const auth = caller();
    await quota.reserve(auth, LIMITS, 500, {}, NOW);

    await expect(
      quota.reserve(auth, LIMITS, 200, { requestId: 'req_x' }, NOW),
    ).rejects.toMatchObject({
      status: 429,
      payload: { code: 'rate_limit_exceeded', type: 'rate_limit_error' },
    });
    expect(await read(RedisKeys.tenantTokens(auth.tenantId, minute))).toBe(500);
    expect(await read(RedisKeys.apiKeyTokens(auth.tenantId, auth.apiKeyId, minute))).toBe(500);
  });

  it('tells the client when to retry and what the limit was', async () => {
    const auth = caller();
    const error = await quota.reserve(auth, LIMITS, 601, {}, NOW).catch((e: unknown) => e);
    expect(error).toMatchObject({
      headers: { 'Retry-After': '50', 'X-RateLimit-Limit-Tokens': '600' },
    });
  });

  it('rejects on the tenant quota when several keys together exceed it', async () => {
    const tenantId = harness.tenantId();
    await quota.reserve({ tenantId, apiKeyId: randomUUID() }, LIMITS, 500, {}, NOW);
    await quota.reserve({ tenantId, apiKeyId: randomUUID() }, LIMITS, 500, {}, NOW);

    const error = await quota
      .reserve({ tenantId, apiKeyId: randomUUID() }, LIMITS, 100, {}, NOW)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429 });
    expect((error as Error).message).toMatch(/account/i);
  });

  it('holds exactly under concurrency: a burst cannot over-reserve', async () => {
    const auth = caller();
    const limits = { tenantTokens: 1000, keyTokens: 100_000 };

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => quota.reserve(auth, limits, 100, {}, NOW)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(50 - 10);
    expect(await read(RedisKeys.tenantTokens(auth.tenantId, minute))).toBe(1000);
  });

  it('ignores a correction for a minute that has already expired', async () => {
    const auth = caller();
    const reservation = await quota.reserve(auth, LIMITS, 100, {}, NOW);
    await harness.redis.client.del(...reservation!.keys);

    await quota.commit(reservation, 50);

    // It must not recreate a counter with no expiry.
    expect(await harness.redis.client.exists(...reservation!.keys)).toBe(0);
  });

  it('logs a structured event when it blocks', async () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    const auth = caller();

    await quota.reserve(auth, LIMITS, 700, { requestId: 'req_log' }, NOW).catch(() => undefined);

    const entry = JSON.parse(lines.find((line) => line.includes('token_quota_blocked'))!);
    expect(entry).toMatchObject({
      event: 'token_quota_blocked',
      level: 'warn',
      requestId: 'req_log',
      tenantId: auth.tenantId,
      apiKeyId: auth.apiKeyId,
      limit: 600,
      requested: 700,
    });
    expect(typeof entry.timestamp).toBe('string');
  });

  describe('when Redis is down', () => {
    it('fails closed by default and skips the quota when failing open', async () => {
      const closed = await createRedisHarness(DEAD_REDIS);
      const open = await createRedisHarness({ ...DEAD_REDIS, GATEWAY_FAIL_OPEN: true });
      try {
        const strict = new TokenQuotaService(new WindowCounter(closed.redis), closed.policy);
        await expect(strict.reserve(caller(), LIMITS, 10, {}, NOW)).rejects.toMatchObject({
          status: 503,
        });

        const lenient = new TokenQuotaService(new WindowCounter(open.redis), open.policy);
        await expect(lenient.reserve(caller(), LIMITS, 10, {}, NOW)).resolves.toBeNull();
      } finally {
        await closed.close();
        await open.close();
      }
    }, 20_000);
  });
});
