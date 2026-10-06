import type { CircuitState, ProviderHealth } from '@tollbooth/shared';

/** At or above this share of failed requests in the last hour, a provider is DEGRADED. */
export const DEGRADED_ERROR_RATE = 0.1;

/** Below this many requests in the window the error rate is too noisy to call a provider degraded. */
const MIN_SAMPLE = 5;

/**
 * One word for how a provider is doing, from what the gateway is doing about it (circuit state) and
 * how this tenant's recent calls went. A circuit that is not CLOSED is the gateway's own verdict and
 * wins over statistics.
 */
export function classifyProviderHealth(input: {
  enabled: boolean;
  circuit: CircuitState | null;
  recentRequests: number;
  recentFailures: number;
}): ProviderHealth {
  if (!input.enabled) return 'DISABLED';
  if (input.circuit === 'OPEN') return 'DOWN';
  if (input.circuit === 'HALF_OPEN') return 'DEGRADED';
  if (input.recentRequests === 0) return 'IDLE';
  const errorRate = input.recentFailures / input.recentRequests;
  return input.recentRequests >= MIN_SAMPLE && errorRate >= DEGRADED_ERROR_RATE
    ? 'DEGRADED'
    : 'HEALTHY';
}
