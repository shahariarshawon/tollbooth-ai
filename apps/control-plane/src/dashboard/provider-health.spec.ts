import { classifyProviderHealth } from './provider-health';

const base = { enabled: true, circuit: 'CLOSED', recentRequests: 20, recentFailures: 0 } as const;

describe('classifyProviderHealth', () => {
  it('reports a provider the gateway may not use as DISABLED, whatever else is true', () => {
    expect(classifyProviderHealth({ ...base, enabled: false, circuit: 'OPEN' })).toBe('DISABLED');
  });

  it('lets the circuit breaker decide: OPEN is DOWN and HALF_OPEN is DEGRADED, even with no failures', () => {
    expect(classifyProviderHealth({ ...base, circuit: 'OPEN' })).toBe('DOWN');
    expect(classifyProviderHealth({ ...base, circuit: 'HALF_OPEN' })).toBe('DEGRADED');
  });

  it('is IDLE with no recent traffic and HEALTHY with clean traffic', () => {
    expect(classifyProviderHealth({ ...base, recentRequests: 0 })).toBe('IDLE');
    expect(classifyProviderHealth(base)).toBe('HEALTHY');
  });

  it('calls a provider DEGRADED once a tenth of a meaningful sample failed', () => {
    expect(classifyProviderHealth({ ...base, recentRequests: 20, recentFailures: 1 })).toBe(
      'HEALTHY',
    );
    expect(classifyProviderHealth({ ...base, recentRequests: 20, recentFailures: 2 })).toBe(
      'DEGRADED',
    );
  });

  it('does not judge a provider on a handful of requests', () => {
    expect(classifyProviderHealth({ ...base, recentRequests: 2, recentFailures: 2 })).toBe(
      'HEALTHY',
    );
  });

  it('still reports HEALTHY when the circuit state is unknown (Redis unreachable) and traffic is clean', () => {
    expect(classifyProviderHealth({ ...base, circuit: null })).toBe('HEALTHY');
  });
});
