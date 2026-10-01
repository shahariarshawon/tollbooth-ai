import { DEFAULT_PLAN_LIMITS } from '../src/traffic/plan-limits';
import {
  bearer,
  chat,
  createFixture,
  createTestContext,
  destroyTestContext,
  http,
  resetTrafficState,
  setProvider,
} from './support/context';
import type { Fixture, TestContext } from './support/context';

/**
 * Phase 7, Task 9: a daily cap on top of the monthly one. Isolated in its own file, with its own plan
 * table, so it cannot affect the budget amounts the rest of the suite relies on.
 *
 * `max_tokens` is set explicitly on every request here so the pre-call worst-case reservation
 * (input tokens + max_tokens, see budget/cost-estimator.ts `worstCaseMicroUsd`) matches what the fake
 * actually returns (7 output tokens): at gemini-2.0-flash's seeded paid-tier prices, 11 input + 7 output
 * tokens costs exactly 5 micro-dollars, which is also the daily cap below.
 */
describe('Daily budget (e2e)', () => {
  let ctx: TestContext;
  let fixture: Fixture;

  beforeAll(async () => {
    ctx = await createTestContext({
      planLimits: {
        STARTUP: {
          ...DEFAULT_PLAN_LIMITS.STARTUP,
          monthlyBudgetUsd: 100, // roomy: the day should bind first
          dailyBudgetUsd: 0.000005, // 5 micro-dollars: exactly one call's worth
        },
      },
    });
    fixture = await createFixture(ctx, 'STARTUP');
    await setProvider(ctx, 'Google Gemini', { status: 'ACTIVE', tier: 'paid' });
  });
  afterAll(async () => {
    if (ctx) await destroyTestContext(ctx);
  });
  beforeEach(async () => {
    ctx.fake.behavior = 'ok';
    ctx.fake.received.length = 0;
    await resetTrafficState(ctx);
  });

  const post = (body: unknown = chat('Hello', { max_tokens: 7 })) =>
    http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(fixture.key.raw))
      .send(body as object);

  it('allows a request that fits the day, even though the month has far more room', async () => {
    await post().expect(200);
    expect(ctx.fake.received).toHaveLength(1);
  });

  it('rejects once the day is spent, although the month is nowhere near its own cap', async () => {
    await post().expect(200); // spends the whole 5-micro-dollar day

    const res = await post().expect(402);

    expect(res.body.error).toMatchObject({ type: 'budget_error', code: 'budget_exceeded' });
    expect(ctx.fake.received).toHaveLength(1); // the second call never reached the provider
  });

  it('is rejected early by the budget guard, before the body is even validated', async () => {
    await post().expect(200);

    // A body with no messages would normally fail DTO validation first; the budget guard runs before
    // that (see budget/budget.guard.ts), so this still comes back as a budget error, not a validation one.
    const res = await http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(fixture.key.raw))
      .send({ model: 'gemini-2.0-flash' })
      .expect(402);

    expect(res.body.error.code).toBe('budget_exceeded');
  });

  it('is a separate pool from the monthly budget: a fresh key behaves like a fresh tenant', async () => {
    await post().expect(200);
    await post().expect(402);

    // Stands in for the daily key's TTL rolling over at midnight: a new bucket starts at 0, independent
    // of the (still roomy) month.
    await resetTrafficState(ctx);
    await post().expect(200);
  });
});
