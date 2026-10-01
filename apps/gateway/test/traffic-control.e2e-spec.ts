import { setLogSink } from '../src/common/logging/structured-logger';
import { RedisKeys, monthBucket } from '../src/redis/redis.constants';
import {
  bearer,
  chat,
  createFixture,
  createKey,
  createTestContext,
  destroyTestContext,
  http,
  resetTrafficState,
  tenantCounter,
} from './support/context';
import type { Fixture, TestContext } from './support/context';

// Small limits so each control can be reached in a few requests. FREE is the plan test tenants have.
const LIMITS = {
  FREE: {
    requestsPerMinute: 6,
    keyRequestsPerMinute: 3,
    tokensPerMinute: 5000,
    keyTokensPerMinute: 4000,
    monthlyBudgetUsd: 1,
  },
  // Roomy limits, for tests that need many requests (the circuit breaker) without tripping a limit.
  STARTUP: {
    requestsPerMinute: 10_000,
    keyRequestsPerMinute: 10_000,
    tokensPerMinute: 10_000_000,
    keyTokensPerMinute: 10_000_000,
    monthlyBudgetUsd: 1_000,
  },
};
const MICRO = 1_000_000;

describe('Traffic control (e2e)', () => {
  let ctx: TestContext;
  let fixture: Fixture;

  beforeAll(async () => {
    ctx = await createTestContext({
      planLimits: LIMITS,
      circuit: { failureThreshold: 3, openMs: 800, successesToClose: 2, probeTimeoutMs: 5000 },
    });
    fixture = await createFixture(ctx);
  });
  afterAll(async () => {
    if (ctx) await destroyTestContext(ctx);
  });
  beforeEach(async () => {
    ctx.fake.behavior = 'ok';
    ctx.fake.received.length = 0;
    await resetTrafficState(ctx);
  });
  afterEach(() => setLogSink(null));

  const post = (body: unknown = chat(), key = fixture.key.raw) =>
    http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(key))
      .send(body as object);

  const records = (status?: 'SUCCESS' | 'FAILED') =>
    ctx.prisma.aiRequest.count({
      where: { tenantId: fixture.tenantId, ...(status && { status }) },
    });

  const budgetKey = (tenantId = fixture.tenantId) =>
    RedisKeys.budget(tenantId, monthBucket(new Date()));
  const budget = async (tenantId = fixture.tenantId) => {
    const hash = await ctx.redis.client.hgetall(budgetKey(tenantId));
    return Object.fromEntries(Object.entries(hash).map(([k, v]) => [k, Number(v)]));
  };
  const circuit = async () => {
    const raw = await ctx.redis.client.get(RedisKeys.circuit('gemini'));
    return raw ? (JSON.parse(raw) as { state: string; failureCount: number }) : null;
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Logs events into an array for the duration of a test. */
  const captureLogs = () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    return (event: string) => {
      const line = lines.find((entry) => entry.includes(`"event":"${event}"`));
      return line ? (JSON.parse(line) as Record<string, unknown>) : undefined;
    };
  };

  describe('rate limiting', () => {
    it('allows requests within the key limit and reports what is left', async () => {
      const remaining: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await post().expect(200);
        expect(res.headers['x-ratelimit-limit-requests']).toBe('3');
        remaining.push(res.headers['x-ratelimit-remaining-requests'] as string);
      }
      expect(remaining).toEqual(['2', '1', '0']);
    });

    it('answers 429 once the key limit is reached, without calling the provider', async () => {
      for (let i = 0; i < 3; i++) await post().expect(200);
      const before = ctx.fake.received.length;

      const res = await post().expect(429);

      expect(res.body.error).toMatchObject({
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      });
      expect(res.body.error.message).toMatch(/API key/);
      expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
      expect(res.headers['x-ratelimit-remaining-requests']).toBe('0');
      expect(ctx.fake.received.length).toBe(before);
    });

    it('does not record blocked requests as usage', async () => {
      const before = await records();
      for (let i = 0; i < 5; i++) await post();
      expect((await records()) - before).toBe(3);
    });

    it('uses the limit configured on the key itself', async () => {
      const strict = await createKey(ctx, fixture.tenantId, fixture.projectId, { rateLimit: 1 });
      await post(chat(), strict.raw).expect(200);
      await post(chat(), strict.raw).expect(429);
    });

    it('limits a tenant across all of its keys', async () => {
      const keys = await Promise.all(
        [1, 2, 3].map(() => createKey(ctx, fixture.tenantId, fixture.projectId, { rateLimit: 10 })),
      );
      // Six requests spread over three keys use up the tenant limit (6) without any key reaching its own.
      for (const key of [...keys, ...keys]) await post(chat(), key.raw).expect(200);

      const res = await post(chat(), keys[0]!.raw).expect(429);
      expect(res.body.error.message).toMatch(/account/);
    });

    it('does not let one tenant use up another tenant limit', async () => {
      const other = await createFixture(ctx);
      for (let i = 0; i < 4; i++) await post();

      await post().expect(429);
      await post(chat(), other.key.raw).expect(200);
    });

    it('does not count requests that fail authentication', async () => {
      for (let i = 0; i < 6; i++) {
        await post(chat(), 'tb_not_a_real_key_0123456789abcdef').expect(401);
      }
      expect(await tenantCounter(ctx, fixture.tenantId, 'requests')).toBe(0);
      for (let i = 0; i < 3; i++) await post().expect(200);
    });

    it('checks the limit before using up tokens or budget', async () => {
      for (let i = 0; i < 6; i++) await post();
      // Three requests were served at 18 tokens each; the three blocked ones reserved nothing.
      expect(await tenantCounter(ctx, fixture.tenantId, 'tokens')).toBe(3 * 18);
    });

    it('logs a structured event when it blocks', async () => {
      const event = captureLogs();
      for (let i = 0; i < 4; i++) await post();

      expect(event('rate_limit_blocked')).toMatchObject({
        level: 'warn',
        tenantId: fixture.tenantId,
        apiKeyId: fixture.key.id,
        limit: 3,
        scope: 'key',
      });
      expect(typeof event('rate_limit_blocked')?.['timestamp']).toBe('string');
    });
  });

  describe('token quota', () => {
    it('tracks the real token usage after each call', async () => {
      await post(chat('Hello', { max_tokens: 100 })).expect(200);
      // The call reserved about 108 tokens, then settled to what the provider reported: 11 + 7.
      expect(await tenantCounter(ctx, fixture.tenantId, 'tokens')).toBe(18);

      await post(chat('Hello', { max_tokens: 100 })).expect(200);
      expect(await tenantCounter(ctx, fixture.tenantId, 'tokens')).toBe(36);
    });

    it('rejects a request whose worst case would exceed the key quota', async () => {
      const res = await post(chat('Hello', { max_tokens: 4096 })).expect(429);

      expect(res.body.error).toMatchObject({
        code: 'rate_limit_exceeded',
        type: 'rate_limit_error',
      });
      expect(res.body.error.message).toMatch(/Token limit.*API key/);
      expect(res.headers['x-ratelimit-limit-tokens']).toBe('4000');
      expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('never lets simultaneous requests jointly exceed the quota', async () => {
      const responses = await Promise.all([
        post(chat('Hello', { max_tokens: 3000 })),
        post(chat('Hello', { max_tokens: 3000 })),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
    });

    it('gives the tokens back when the provider fails', async () => {
      ctx.fake.behavior = 'server-error';
      await post(chat('Hello', { max_tokens: 100 })).expect(503);

      expect(await tenantCounter(ctx, fixture.tenantId, 'tokens')).toBe(0);
    });
  });

  describe('budget', () => {
    const modelPrices = () =>
      ctx.prisma.aiModel.findFirstOrThrow({
        where: { modelName: 'gemini-2.0-flash', provider: { type: 'GOOGLE' } },
      });

    it('settles the real cost after a call and holds nothing back', async () => {
      await post().expect(200);

      const prices = await modelPrices();
      const expected =
        Math.ceil(11 * Number(prices.inputTokenPrice)) +
        Math.ceil(7 * Number(prices.outputTokenPrice));
      expect(await budget()).toEqual({
        monthlyLimit: MICRO,
        currentUsage: expected,
        reserved: 0,
        remaining: MICRO - expected,
      });
    });

    it('accumulates spend over several calls', async () => {
      await post().expect(200);
      const first = (await budget())['currentUsage']!;
      await post().expect(200);
      expect((await budget())['currentUsage']).toBe(first * 2);
    });

    it('answers 402 when the request does not fit in what is left, and undoes everything it took', async () => {
      await ctx.redis.client.hset(budgetKey(), { currentUsage: MICRO - 1 });
      const event = captureLogs();
      const recordsBefore = await records();

      const res = await post().expect(402);

      expect(res.body.error).toMatchObject({ type: 'budget_error', code: 'budget_exceeded' });
      expect(ctx.fake.received).toHaveLength(0);
      // The token reservation taken before the budget check was handed back.
      expect(await tenantCounter(ctx, fixture.tenantId, 'tokens')).toBe(0);
      expect(await records()).toBe(recordsBefore);
      expect(event('budget_blocked')).toMatchObject({
        level: 'warn',
        tenantId: fixture.tenantId,
        remaining: 1,
        unit: 'micro_usd',
      });
      expect(Number(event('budget_blocked')?.['requested'])).toBeGreaterThan(1);
    });

    it('turns away a tenant that has used the whole month before doing any other work', async () => {
      await ctx.redis.client.hset(budgetKey(), { currentUsage: MICRO });
      const event = captureLogs();

      const res = await post().expect(402);

      expect(res.body.error.code).toBe('budget_exceeded');
      expect(event('budget_blocked')).toMatchObject({ requested: 0, remaining: 0 });
      expect(await tenantCounter(ctx, fixture.tenantId, 'tokens')).toBe(0);
    });

    it('gives the held amount back when the provider fails', async () => {
      ctx.fake.behavior = 'server-error';
      await post().expect(503);

      expect(await budget()).toMatchObject({ reserved: 0, currentUsage: 0, remaining: MICRO });
    });

    it('keeps budgets of different tenants apart', async () => {
      const other = await createFixture(ctx);
      await ctx.redis.client.hset(budgetKey(), { currentUsage: MICRO });

      await post().expect(402);
      await post(chat(), other.key.raw).expect(200);
    });
  });

  describe('circuit breaker', () => {
    // Its own tenant on a plan with roomy limits, so no request is stopped before it reaches the breaker.
    let roomy: Fixture;
    beforeAll(async () => {
      roomy = await createFixture(ctx, 'STARTUP');
    });

    const send = (body: unknown = chat()) => post(body, roomy.key.raw);
    const failedRecords = () =>
      ctx.prisma.aiRequest.count({ where: { tenantId: roomy.tenantId, status: 'FAILED' } });
    const tokens = () => tenantCounter(ctx, roomy.tenantId, 'tokens');

    const openCircuit = async () => {
      ctx.fake.behavior = 'server-error';
      for (let i = 0; i < 3; i++) await send().expect(503);
    };

    it('opens after repeated provider failures and then fails fast', async () => {
      await openCircuit();
      expect(ctx.fake.received).toHaveLength(3);
      expect(await circuit()).toMatchObject({ state: 'OPEN', failureCount: 3 });

      const started = Date.now();
      const res = await send().expect(503);

      expect(Date.now() - started).toBeLessThan(500);
      expect(res.body.error).toMatchObject({ type: 'api_error', code: 'provider_unavailable' });
      expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      // The provider was not called again.
      expect(ctx.fake.received).toHaveLength(3);
    });

    it('releases what a refused request took, and does not record it as a provider failure', async () => {
      const event = captureLogs();
      const failedBefore = await failedRecords();
      await openCircuit();
      const tokensBefore = await tokens();

      await send().expect(503);

      expect(await tokens()).toBe(tokensBefore);
      expect((await budget(roomy.tenantId))['reserved']).toBe(0);
      expect((await failedRecords()) - failedBefore).toBe(3);
      expect(event('circuit_state_changed')).toMatchObject({
        from: 'CLOSED',
        to: 'OPEN',
        provider: 'gemini',
      });
      expect(event('circuit_open_rejected')).toMatchObject({
        tenantId: roomy.tenantId,
        state: 'OPEN',
      });
    });

    it('recovers: after the wait a trial request is let through and success closes the circuit', async () => {
      await openCircuit();
      await sleep(900);
      ctx.fake.behavior = 'ok';

      await send().expect(200); // the trial
      expect(await circuit()).toMatchObject({ state: 'HALF_OPEN' });
      await send().expect(200); // the second success closes it

      expect(await circuit()).toBeNull();
      await send().expect(200);
    });

    it('opens again when the trial request fails', async () => {
      await openCircuit();
      await sleep(900);

      await send().expect(503); // the trial reaches the provider and fails
      expect(ctx.fake.received).toHaveLength(4);
      expect(await circuit()).toMatchObject({ state: 'OPEN' });

      await send().expect(503); // refused at once
      expect(ctx.fake.received).toHaveLength(4);
    });

    it('does not count requests the provider rejected as invalid against its health', async () => {
      ctx.fake.behavior = 'bad-request';
      for (let i = 0; i < 5; i++) await send(chat('Hi', { temperature: 1.5 })).expect(400);

      expect(await circuit()).toBeNull();
      ctx.fake.behavior = 'ok';
      await send().expect(200);
    });

    it('a healthy call resets the count of consecutive failures', async () => {
      ctx.fake.behavior = 'server-error';
      await send().expect(503);
      await send().expect(503);
      ctx.fake.behavior = 'ok';
      await send().expect(200);
      ctx.fake.behavior = 'server-error';
      await send().expect(503);
      await send().expect(503);

      expect(await circuit()).toMatchObject({ state: 'CLOSED', failureCount: 2 });
    });
  });

  describe('Redis health endpoint', () => {
    it('reports healthy with a latency, without authentication', async () => {
      const res = await http(ctx).get('/health/redis').expect(200);
      expect(res.body).toEqual({ status: 'healthy', latency: expect.stringMatching(/^\d+ms$/) });
    });
  });
});
