import type { AlertService } from '../../src/alerts/alert.service';
import { BudgetService } from '../../src/budget/budget.service';
import { setLogSink } from '../../src/common/logging/structured-logger';
import { RedisKeys, dayBucket, monthBucket } from '../../src/redis/redis.constants';
import { DEAD_REDIS, createRedisHarness } from '../support/redis-harness';
import type { RedisHarness } from '../support/redis-harness';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const LIMIT = 1_000_000; // one dollar, in micro-dollars

/** This file is about the Redis-backed counters, not alerting (see alerts/alert.service.spec.ts and
 *  providers.e2e-spec.ts for that); a stub is enough to satisfy BudgetService's constructor. */
const fakeAlerts = () =>
  ({ create: jest.fn().mockResolvedValue(undefined) }) as unknown as AlertService;

describe('Budget counters (integration)', () => {
  let harness: RedisHarness;
  let budget: BudgetService;
  let alerts: ReturnType<typeof fakeAlerts>;

  beforeAll(async () => {
    harness = await createRedisHarness();
    alerts = fakeAlerts();
    budget = new BudgetService(harness.redis, harness.policy, alerts);
  });
  afterAll(() => harness.close());
  afterEach(() => setLogSink(null));

  it('reports a full budget for a tenant that has spent nothing, without creating anything', async () => {
    const tenantId = harness.tenantId();
    const status = await budget.checkBudget(tenantId, LIMIT, 0, NOW);

    expect(status).toMatchObject({ allowed: true, remaining: LIMIT, currentUsage: 0, reserved: 0 });
    expect(await budget.snapshot(tenantId, NOW)).toBeNull();
  });

  it('allows a request that fits and holds the amount', async () => {
    const tenantId = harness.tenantId();
    const reservation = await budget.reserveBudget(tenantId, LIMIT, 300_000, {}, NOW);

    expect(reservation).toEqual({
      tenantId,
      month: '202610',
      amountMicroUsd: 300_000,
      period: 'month',
    });
    expect(await budget.snapshot(tenantId, NOW)).toEqual({
      monthlyLimit: LIMIT,
      currentUsage: 0,
      reserved: 300_000,
      remaining: 700_000,
    });
  });

  it('checkBudget says whether an amount would fit, without holding it', async () => {
    const tenantId = harness.tenantId();
    await budget.reserveBudget(tenantId, LIMIT, 900_000, {}, NOW);

    expect(await budget.checkBudget(tenantId, LIMIT, 50_000, NOW)).toMatchObject({
      allowed: true,
      remaining: 100_000,
    });
    expect(await budget.checkBudget(tenantId, LIMIT, 200_000, NOW)).toMatchObject({
      allowed: false,
    });
    expect((await budget.snapshot(tenantId, NOW))?.reserved).toBe(900_000);
  });

  it('blocks a request that does not fit, with 402, and changes nothing', async () => {
    const tenantId = harness.tenantId();
    await budget.reserveBudget(tenantId, LIMIT, 900_000, {}, NOW);

    await expect(budget.reserveBudget(tenantId, LIMIT, 200_000, {}, NOW)).rejects.toMatchObject({
      status: 402,
      payload: { code: 'budget_exceeded', type: 'budget_error' },
    });
    expect((await budget.snapshot(tenantId, NOW))?.reserved).toBe(900_000);
  });

  it('creates a BUDGET_LIMIT alert when the budget is exceeded (Task 7)', async () => {
    const tenantId = harness.tenantId();
    await budget.reserveBudget(tenantId, LIMIT, 900_000, {}, NOW);

    await expect(budget.reserveBudget(tenantId, LIMIT, 200_000, {}, NOW)).rejects.toMatchObject({
      status: 402,
    });

    expect(alerts.create).toHaveBeenCalledWith(
      tenantId,
      'BUDGET_LIMIT',
      expect.any(String),
      'CRITICAL',
    );
  });

  it('logs what was asked for and what was left when it blocks', async () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    const tenantId = harness.tenantId();
    await budget.reserveBudget(tenantId, LIMIT, 900_000, {}, NOW);

    await budget
      .reserveBudget(tenantId, LIMIT, 200_000, { requestId: 'req_b' }, NOW)
      .catch(() => undefined);

    const entry = JSON.parse(lines.find((line) => line.includes('budget_blocked'))!);
    expect(entry).toMatchObject({
      event: 'budget_blocked',
      level: 'warn',
      requestId: 'req_b',
      tenantId,
      requested: 200_000,
      remaining: 100_000,
    });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('releases a hold that was not used', async () => {
    const tenantId = harness.tenantId();
    const reservation = await budget.reserveBudget(tenantId, LIMIT, 400_000, {}, NOW);
    await budget.releaseBudget(reservation);

    expect(await budget.snapshot(tenantId, NOW)).toMatchObject({
      reserved: 0,
      currentUsage: 0,
      remaining: LIMIT,
    });
  });

  it('settles a hold into real usage', async () => {
    const tenantId = harness.tenantId();
    const reservation = await budget.reserveBudget(tenantId, LIMIT, 400_000, {}, NOW);
    await budget.updateUsage(reservation, 250_000);

    expect(await budget.snapshot(tenantId, NOW)).toEqual({
      monthlyLimit: LIMIT,
      currentUsage: 250_000,
      reserved: 0,
      remaining: 750_000,
    });
  });

  it('keeps the monthly limit when releasing or settling', async () => {
    const tenantId = harness.tenantId();
    const first = await budget.reserveBudget(tenantId, LIMIT, 100_000, {}, NOW);
    await budget.updateUsage(first, 80_000);
    const second = await budget.reserveBudget(tenantId, LIMIT, 100_000, {}, NOW);
    await budget.releaseBudget(second);

    expect((await budget.snapshot(tenantId, NOW))?.monthlyLimit).toBe(LIMIT);
  });

  it('accumulates usage across requests and then refuses once the month is used up', async () => {
    const tenantId = harness.tenantId();
    for (let i = 0; i < 4; i++) {
      const reservation = await budget.reserveBudget(tenantId, LIMIT, 250_000, {}, NOW);
      await budget.updateUsage(reservation, 250_000);
    }
    expect(await budget.snapshot(tenantId, NOW)).toMatchObject({
      currentUsage: LIMIT,
      remaining: 0,
    });
    await expect(budget.reserveBudget(tenantId, LIMIT, 1, {}, NOW)).rejects.toMatchObject({
      status: 402,
    });
  });

  it('records usage even when the real cost exceeded the estimate', async () => {
    const tenantId = harness.tenantId();
    const reservation = await budget.reserveBudget(tenantId, LIMIT, 100_000, {}, NOW);
    await budget.updateUsage(reservation, 130_000);
    expect(await budget.snapshot(tenantId, NOW)).toMatchObject({
      currentUsage: 130_000,
      reserved: 0,
    });
  });

  it('is exact under concurrency: a burst cannot overspend', async () => {
    const tenantId = harness.tenantId();

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => budget.reserveBudget(tenantId, LIMIT, 100_000, {}, NOW)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(40);
    expect(await budget.snapshot(tenantId, NOW)).toMatchObject({ reserved: LIMIT, remaining: 0 });
  });

  it('starts every month with a fresh budget', async () => {
    const tenantId = harness.tenantId();
    await budget.reserveBudget(tenantId, LIMIT, LIMIT, {}, NOW);
    await expect(budget.reserveBudget(tenantId, LIMIT, 1, {}, NOW)).rejects.toMatchObject({
      status: 402,
    });

    const nextMonth = new Date('2026-11-01T00:00:01.000Z');
    await expect(
      budget.reserveBudget(tenantId, LIMIT, 500_000, {}, nextMonth),
    ).resolves.toMatchObject({
      month: '202611',
    });
  });

  it('applies a changed plan limit straight away', async () => {
    const tenantId = harness.tenantId();
    await budget.reserveBudget(tenantId, LIMIT, LIMIT, {}, NOW);

    const upgraded = await budget.reserveBudget(tenantId, 5_000_000, 1_000_000, {}, NOW);
    expect(upgraded).not.toBeNull();
    expect(await budget.snapshot(tenantId, NOW)).toMatchObject({
      monthlyLimit: 5_000_000,
      reserved: 2_000_000,
      remaining: 3_000_000,
    });
  });

  it('stores the budget in a monthly hash that expires', async () => {
    const tenantId = harness.tenantId();
    await budget.reserveBudget(tenantId, LIMIT, 1000, {}, NOW);

    const key = RedisKeys.budget(tenantId, monthBucket(NOW));
    expect(key).toBe(`tenant:{${tenantId}}:budget:202610`);
    expect(await harness.redis.client.type(key)).toBe('hash');
    expect(await harness.redis.client.ttl(key)).toBeGreaterThan(30 * 24 * 3600);
  });

  it('does nothing when releasing or settling a missing hold', async () => {
    const tenantId = harness.tenantId();
    await budget.releaseBudget({ tenantId, month: '202610', amountMicroUsd: 5 });
    expect(await budget.snapshot(tenantId, NOW)).toBeNull();
    await budget.releaseBudget(null);
    await budget.updateUsage(null, 10);
  });

  describe('daily budget (period: "day"), Phase 7 Task 9', () => {
    it('uses its own key and TTL, independent of the monthly budget', async () => {
      const tenantId = harness.tenantId();

      const reservation = await budget.reserveBudget(tenantId, LIMIT, 300_000, {}, NOW, 'day');

      expect(reservation).toEqual({
        tenantId,
        month: dayBucket(NOW),
        amountMicroUsd: 300_000,
        period: 'day',
      });
      const key = RedisKeys.dailyBudget(tenantId, dayBucket(NOW));
      expect(key).toBe(`tenant:{${tenantId}}:budget:daily:20261015`);
      expect(await harness.redis.client.exists(RedisKeys.budget(tenantId, monthBucket(NOW)))).toBe(
        0,
      );
      expect(await budget.snapshot(tenantId, NOW, 'day')).toMatchObject({ reserved: 300_000 });
      expect(await budget.snapshot(tenantId, NOW)).toBeNull(); // the monthly key, untouched
    });

    it('rejects once the day is exhausted, independent of how much of the month is left', async () => {
      const tenantId = harness.tenantId();
      await budget.reserveBudget(tenantId, LIMIT, LIMIT, {}, NOW, 'day');

      await expect(budget.reserveBudget(tenantId, LIMIT, 1, {}, NOW, 'day')).rejects.toMatchObject({
        status: 402,
      });
      // The month (a much bigger LIMIT would be typical, but even the same limit) is a separate pool.
      await expect(budget.reserveBudget(tenantId, LIMIT, 1, {}, NOW)).resolves.toMatchObject({
        period: 'month',
      });
    });

    it('settles and releases a daily reservation against its own key', async () => {
      const tenantId = harness.tenantId();
      const reservation = await budget.reserveBudget(tenantId, LIMIT, 400_000, {}, NOW, 'day');
      await budget.updateUsage(reservation, 250_000);

      expect(await budget.snapshot(tenantId, NOW, 'day')).toMatchObject({
        currentUsage: 250_000,
        reserved: 0,
      });
    });
  });

  describe('when Redis is down', () => {
    it('fails closed by default and skips the budget when failing open', async () => {
      const closed = await createRedisHarness(DEAD_REDIS);
      const open = await createRedisHarness({ ...DEAD_REDIS, GATEWAY_FAIL_OPEN: true });
      try {
        await expect(
          new BudgetService(closed.redis, closed.policy, fakeAlerts()).reserveBudget(
            't',
            LIMIT,
            10,
            {},
            NOW,
          ),
        ).rejects.toMatchObject({ status: 503 });

        const lenient = new BudgetService(open.redis, open.policy, fakeAlerts());
        await expect(lenient.reserveBudget('t', LIMIT, 10, {}, NOW)).resolves.toBeNull();
        await expect(lenient.checkBudget('t', LIMIT, 10, NOW)).resolves.toMatchObject({
          bypassed: true,
        });
        // Bookkeeping after the call never raises, even with Redis gone.
        await expect(
          lenient.updateUsage({ tenantId: 't', month: '202610', amountMicroUsd: 1 }, 1),
        ).resolves.toBeUndefined();
      } finally {
        await closed.close();
        await open.close();
      }
    }, 20_000);
  });
});
