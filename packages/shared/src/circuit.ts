/**
 * The provider circuit breaker's stored state. The gateway writes it (as JSON under `circuitKey`) and
 * the control plane reads it for the dashboard, so the key format and shape live here, once.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitSnapshot {
  state: CircuitState;
  failureCount: number;
  /** ISO timestamp of the latest failure, if any. */
  lastFailure: string | null;
}

/** The Redis key holding one provider's circuit state. Global per provider, not per tenant. */
export const circuitKey = (provider: string): string =>
  `provider:${provider.toLowerCase()}:circuit`;

/** Reads the stored JSON. An absent key means the circuit has never opened: CLOSED with no failures. */
export function parseCircuitSnapshot(raw: string | null): CircuitSnapshot {
  if (!raw) return { state: 'CLOSED', failureCount: 0, lastFailure: null };
  const stored = JSON.parse(raw) as Partial<CircuitSnapshot>;
  return {
    state: stored.state ?? 'CLOSED',
    failureCount: stored.failureCount ?? 0,
    lastFailure: stored.lastFailure ?? null,
  };
}
