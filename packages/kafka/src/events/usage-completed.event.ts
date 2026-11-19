import { z } from 'zod';

/**
 * Published once per successful AI request, right after it is recorded in `ai_requests` and the usage
 * ledger (Phase 7). This is the async, off-the-hot-path announcement of that same fact: nothing here is
 * the source of truth, which stays in Postgres regardless of whether this event is ever published or
 * consumed.
 */
export const usageCompletedEventSchema = z.object({
  eventId: z.string().optional(),
  requestId: z.string(),
  correlationId: z.string().optional(),
  tenantId: z.string(),
  projectId: z.string(),
  provider: z.string(),
  model: z.string(),
  requestTokens: z.number().int().min(0),
  responseTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  /** USD, as a decimal string so no precision is lost; "0" on a free-tier provider. */
  estimatedCost: z.string(),
  latencyMs: z.number(),
  isEstimatedTokens: z.boolean().optional(),
  /** ISO 8601, when the event was created (not necessarily when it is consumed). */
  timestamp: z.string(),
});

export type UsageCompletedEvent = z.infer<typeof usageCompletedEventSchema>;

export function validateUsageCompletedEvent(data: unknown): UsageCompletedEvent {
  return usageCompletedEventSchema.parse(data);
}
