import { DEFAULT_PLAN_LIMITS, TrafficLimits } from './plan-limits';

const limits = new TrafficLimits(DEFAULT_PLAN_LIMITS);

describe('TrafficLimits', () => {
  it('gives the STARTUP plan the documented example limits', () => {
    expect(limits.forAuth({ plan: 'STARTUP', rateLimit: null })).toEqual({
      tenantRequests: 100,
      keyRequests: 20,
      tenantTokens: 100_000,
      keyTokens: 50_000,
      monthlyBudgetMicroUsd: 100_000_000,
    });
  });

  it('lets a key override the per-key request limit, and only that', () => {
    const resolved = limits.forAuth({ plan: 'STARTUP', rateLimit: 5 });
    expect(resolved.keyRequests).toBe(5);
    expect(resolved.tenantRequests).toBe(100);
    expect(resolved.keyTokens).toBe(50_000);
  });

  it('converts the monthly budget to micro-dollars as an exact integer', () => {
    const resolved = limits.forAuth({ plan: 'FREE', rateLimit: null });
    expect(resolved.monthlyBudgetMicroUsd).toBe(10_000_000);
    expect(Number.isInteger(resolved.monthlyBudgetMicroUsd)).toBe(true);
  });

  it('has no daily cap for any plan today', () => {
    for (const plan of Object.values(DEFAULT_PLAN_LIMITS)) {
      expect(plan.dailyBudgetUsd).toBeUndefined();
    }
    expect(limits.forAuth({ plan: 'FREE', rateLimit: null }).dailyBudgetMicroUsd).toBeUndefined();
  });

  it('converts a plan with a daily cap to micro-dollars, when one is configured', () => {
    const withDailyCap = new TrafficLimits({
      ...DEFAULT_PLAN_LIMITS,
      FREE: { ...DEFAULT_PLAN_LIMITS.FREE, dailyBudgetUsd: 2 },
    });
    expect(withDailyCap.forAuth({ plan: 'FREE', rateLimit: null }).dailyBudgetMicroUsd).toBe(
      2_000_000,
    );
  });

  it('gives bigger plans bigger limits at every level', () => {
    const order = ['FREE', 'STARTUP', 'BUSINESS', 'ENTERPRISE'] as const;
    for (let i = 1; i < order.length; i++) {
      const smaller = DEFAULT_PLAN_LIMITS[order[i - 1]!];
      const larger = DEFAULT_PLAN_LIMITS[order[i]!];
      expect(larger.requestsPerMinute).toBeGreaterThanOrEqual(smaller.requestsPerMinute);
      expect(larger.tokensPerMinute).toBeGreaterThanOrEqual(smaller.tokensPerMinute);
      expect(larger.monthlyBudgetUsd).toBeGreaterThan(smaller.monthlyBudgetUsd);
    }
  });

  it('never gives a key more than its tenant', () => {
    for (const plan of Object.values(DEFAULT_PLAN_LIMITS)) {
      expect(plan.keyRequestsPerMinute).toBeLessThanOrEqual(plan.requestsPerMinute);
      expect(plan.keyTokensPerMinute).toBeLessThanOrEqual(plan.tokensPerMinute);
    }
  });

  it('uses whatever table it is given, so tests and later configuration can replace the defaults', () => {
    const custom = new TrafficLimits({
      ...DEFAULT_PLAN_LIMITS,
      FREE: { ...DEFAULT_PLAN_LIMITS.FREE, requestsPerMinute: 1 },
    });
    expect(custom.forAuth({ plan: 'FREE', rateLimit: null }).tenantRequests).toBe(1);
  });
});
