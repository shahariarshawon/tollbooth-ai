/**
 * Published once per successful AI request, right after it is recorded in `ai_requests` and the usage
 * ledger (Phase 7). This is the async, off-the-hot-path announcement of that same fact: nothing here is
 * the source of truth, which stays in Postgres regardless of whether this event is ever published or
 * consumed.
 */
export interface UsageCompletedEvent {
  requestId: string;
  tenantId: string;
  projectId: string;
  provider: string;
  model: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  /** USD, as a decimal string so no precision is lost; "0" on a free-tier provider. */
  estimatedCost: string;
  latencyMs: number;
  /** ISO 8601, when the event was created (not necessarily when it is consumed). */
  timestamp: string;
}
