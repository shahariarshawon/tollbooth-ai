import { z } from 'zod';

/**
 * Published when a provider call fails in a way that counts against the provider (the same failures the
 * circuit breaker reacts to: `auth`, `rate_limited`, `timeout`, `unavailable`). Not published for
 * `bad_request`: the provider refused the request itself, which is the caller's problem, not the
 * provider's, and does not count against it anywhere else in the system either.
 */
export const providerFailedEventSchema = z.object({
  eventId: z.string().optional(),
  requestId: z.string(),
  correlationId: z.string().optional(),
  tenantId: z.string(),
  provider: z.string(),
  model: z.string(),
  /** A ProviderError kind: `auth` | `rate_limited` | `timeout` | `unavailable`. */
  errorKind: z.string(),
  timestamp: z.string(),
});

export type ProviderFailedEvent = z.infer<typeof providerFailedEventSchema>;

export function validateProviderFailedEvent(data: unknown): ProviderFailedEvent {
  return providerFailedEventSchema.parse(data);
}
