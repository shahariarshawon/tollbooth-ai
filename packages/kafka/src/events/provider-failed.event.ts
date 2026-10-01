/**
 * Published when a provider call fails in a way that counts against the provider (the same failures the
 * circuit breaker reacts to: `auth`, `rate_limited`, `timeout`, `unavailable`). Not published for
 * `bad_request`: the provider refused the request itself, which is the caller's problem, not the
 * provider's, and does not count against it anywhere else in the system either.
 */
export interface ProviderFailedEvent {
  requestId: string;
  tenantId: string;
  provider: string;
  model: string;
  /** A ProviderError kind: `auth` | `rate_limited` | `timeout` | `unavailable`. */
  errorKind: string;
  timestamp: string;
}
