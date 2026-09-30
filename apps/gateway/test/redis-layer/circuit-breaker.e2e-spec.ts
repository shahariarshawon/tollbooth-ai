import { CircuitBreakerService } from '../../src/circuit-breaker/circuit-breaker.service';
import type { CircuitBreakerOptions } from '../../src/circuit-breaker/circuit-breaker.service';
import { RedisKeys } from '../../src/redis/redis.constants';
import { DEAD_REDIS, createRedisHarness } from '../support/redis-harness';
import type { RedisHarness } from '../support/redis-harness';

const OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 3,
  openMs: 30_000,
  failureWindowMs: 60_000,
  successesToClose: 2,
  probeTimeoutMs: 10_000,
};
const T0 = 1_790_000_000_000; // a fixed "now", in ms, so every transition is deterministic

describe('Circuit breaker (integration)', () => {
  let harness: RedisHarness;
  let breaker: CircuitBreakerService;

  beforeAll(async () => {
    harness = await createRedisHarness();
    breaker = new CircuitBreakerService(harness.redis, OPTIONS);
  });
  afterAll(() => harness.close());

  const fail = async (provider: string, times: number, at = T0) => {
    for (let i = 0; i < times; i++) await breaker.recordFailure(provider, at + i);
  };

  it('starts closed and lets requests through without storing anything', async () => {
    const provider = harness.providerName();
    await expect(breaker.canRequest(provider, T0)).resolves.toMatchObject({
      allowed: true,
      state: 'CLOSED',
    });
    expect(await harness.redis.client.exists(RedisKeys.circuit(provider))).toBe(0);
    await expect(breaker.getState(provider)).resolves.toEqual({
      state: 'CLOSED',
      failureCount: 0,
      lastFailure: null,
    });
  });

  it('stays closed below the failure threshold', async () => {
    const provider = harness.providerName();
    await fail(provider, 2);

    expect((await breaker.getState(provider)).state).toBe('CLOSED');
    expect((await breaker.getState(provider)).failureCount).toBe(2);
    expect((await breaker.canRequest(provider, T0 + 10)).allowed).toBe(true);
  });

  it('opens after the threshold of consecutive failures and then refuses requests', async () => {
    const provider = harness.providerName();
    await fail(provider, 3);

    const state = await breaker.getState(provider);
    expect(state).toMatchObject({ state: 'OPEN', failureCount: 3 });
    expect(state.lastFailure).toBe(new Date(T0 + 2).toISOString());

    const decision = await breaker.canRequest(provider, T0 + 1000);
    expect(decision).toMatchObject({ allowed: false, state: 'OPEN' });
    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(29);
  });

  it('keeps the documented JSON shape in Redis', async () => {
    const provider = harness.providerName();
    await fail(provider, 3);

    const stored = JSON.parse((await harness.redis.client.get(RedisKeys.circuit(provider)))!);
    expect(stored).toMatchObject({
      state: 'OPEN',
      failureCount: 3,
      lastFailure: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(RedisKeys.circuit('OpenAI')).toBe('provider:openai:circuit');
  });

  it('a success ends the run of failures', async () => {
    const provider = harness.providerName();
    await fail(provider, 2);
    await breaker.recordSuccess(provider);
    await fail(provider, 2, T0 + 100);

    expect((await breaker.getState(provider)).state).toBe('CLOSED');
  });

  it('does not add up failures that are far apart', async () => {
    const provider = harness.providerName();
    await breaker.recordFailure(provider, T0);
    await breaker.recordFailure(provider, T0 + 70_000);
    await breaker.recordFailure(provider, T0 + 140_000);

    expect(await breaker.getState(provider)).toMatchObject({ state: 'CLOSED', failureCount: 1 });
  });

  it('allows a single trial request once the wait is over', async () => {
    const provider = harness.providerName();
    await fail(provider, 3);
    const openedAt = T0 + 2;

    expect((await breaker.canRequest(provider, openedAt + 29_999)).allowed).toBe(false);

    const trial = await breaker.canRequest(provider, openedAt + 30_000);
    expect(trial).toMatchObject({ allowed: true, state: 'HALF_OPEN' });
    expect((await breaker.getState(provider)).state).toBe('HALF_OPEN');

    // While the trial is running, everyone else is still turned away.
    expect((await breaker.canRequest(provider, openedAt + 30_001)).allowed).toBe(false);
  });

  it('closes again after enough successful trial requests', async () => {
    const provider = harness.providerName();
    await fail(provider, 3);
    const later = T0 + 40_000;

    await breaker.canRequest(provider, later);
    await breaker.recordSuccess(provider);
    // One success is not enough (two are required), and the next trial may go ahead straight away.
    expect((await breaker.getState(provider)).state).toBe('HALF_OPEN');
    expect((await breaker.canRequest(provider, later + 1)).allowed).toBe(true);

    await breaker.recordSuccess(provider);
    expect((await breaker.getState(provider)).state).toBe('CLOSED');
    expect(await harness.redis.client.exists(RedisKeys.circuit(provider))).toBe(0);
    expect((await breaker.canRequest(provider, later + 2)).allowed).toBe(true);
  });

  it('opens again, for a full wait, when the trial request fails', async () => {
    const provider = harness.providerName();
    await fail(provider, 3);
    const later = T0 + 40_000;
    await breaker.canRequest(provider, later);

    await breaker.recordFailure(provider, later + 500);

    expect((await breaker.getState(provider)).state).toBe('OPEN');
    expect((await breaker.canRequest(provider, later + 29_000)).allowed).toBe(false);
    expect((await breaker.canRequest(provider, later + 500 + 30_000)).state).toBe('HALF_OPEN');
  });

  it('frees the trial slot if the trial request never reports back', async () => {
    const provider = harness.providerName();
    await fail(provider, 3);
    const later = T0 + 40_000;
    await breaker.canRequest(provider, later);

    expect((await breaker.canRequest(provider, later + 9_999)).allowed).toBe(false);
    expect((await breaker.canRequest(provider, later + 10_001)).allowed).toBe(true);
  });

  it('lets exactly one of many simultaneous requests be the trial', async () => {
    const provider = harness.providerName();
    await fail(provider, 3);

    const decisions = await Promise.all(
      Array.from({ length: 25 }, () => breaker.canRequest(provider, T0 + 60_000)),
    );

    expect(decisions.filter((d) => d.allowed)).toHaveLength(1);
  });

  it('ignores a success from a request that started before the circuit opened', async () => {
    const provider = harness.providerName();
    await fail(provider, 3);

    await breaker.recordSuccess(provider);

    expect((await breaker.getState(provider)).state).toBe('OPEN');
  });

  it('tracks each provider separately', async () => {
    const a = harness.providerName();
    const b = harness.providerName();
    await fail(a, 3);

    expect((await breaker.canRequest(a, T0 + 100)).allowed).toBe(false);
    expect((await breaker.canRequest(b, T0 + 100)).allowed).toBe(true);
  });

  describe('when Redis is down', () => {
    it('never blocks traffic: the breaker is advisory', async () => {
      const dead = await createRedisHarness(DEAD_REDIS);
      try {
        const offline = new CircuitBreakerService(dead.redis, OPTIONS);
        await expect(offline.canRequest('openai', T0)).resolves.toMatchObject({ allowed: true });
        await expect(offline.recordFailure('openai', T0)).resolves.toBeUndefined();
        await expect(offline.recordSuccess('openai')).resolves.toBeUndefined();
      } finally {
        await dead.close();
      }
    }, 15_000);
  });
});
