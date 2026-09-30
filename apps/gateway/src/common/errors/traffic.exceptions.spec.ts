import {
  BudgetExceededException,
  ProviderUnavailableException,
  RateLimitExceededException,
  TrafficControlUnavailableException,
} from './traffic.exceptions';

describe('traffic exceptions', () => {
  it('RateLimitExceededException is a 429 with Retry-After', () => {
    const error = new RateLimitExceededException('Request limit exceeded', 42, { 'X-Extra': '1' });
    expect(error.getStatus()).toBe(429);
    expect(error.payload).toEqual({
      message: 'Request limit exceeded',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
    });
    expect(error.headers).toEqual({ 'Retry-After': '42', 'X-Extra': '1' });
  });

  it('BudgetExceededException is a 402', () => {
    const error = new BudgetExceededException();
    expect(error.getStatus()).toBe(402);
    expect(error.payload).toMatchObject({ type: 'budget_error', code: 'budget_exceeded' });
    expect(error.headers).toEqual({});
  });

  it('ProviderUnavailableException is a 503, with Retry-After only when a wait is known', () => {
    expect(new ProviderUnavailableException().getStatus()).toBe(503);
    expect(new ProviderUnavailableException().payload.code).toBe('provider_unavailable');
    expect(new ProviderUnavailableException().headers).toEqual({});
    expect(new ProviderUnavailableException(12).headers).toEqual({ 'Retry-After': '12' });
  });

  it('TrafficControlUnavailableException is a 503 with its own code', () => {
    const error = new TrafficControlUnavailableException();
    expect(error.getStatus()).toBe(503);
    expect(error.payload.code).toBe('traffic_control_unavailable');
  });

  it('never put internals in any message', () => {
    const messages = [
      new RateLimitExceededException('Request limit exceeded', 1),
      new BudgetExceededException(),
      new ProviderUnavailableException(),
      new TrafficControlUnavailableException(),
    ].map((error) => error.payload.message);
    for (const message of messages) expect(message).not.toMatch(/redis|lua|stack|127\.0|ECONN/i);
  });
});
