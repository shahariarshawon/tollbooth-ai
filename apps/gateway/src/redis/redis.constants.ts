/** How long startup waits for Redis before carrying on (the client keeps reconnecting in the background). */
export const REDIS_STARTUP_WAIT_MS = 3000;

/**
 * Per-minute counters live for one minute. Each minute has its own key, so the key is only ever written
 * during its own minute and the TTL just cleans up afterwards.
 */
export const COUNTER_TTL_SECONDS = 60;

/** A monthly budget key outlives its month a little, so late settlements still find it. */
export const BUDGET_TTL_SECONDS = 40 * 24 * 60 * 60;

/** `2026-10-01T09:30:12.345Z` -> `202610010930`. UTC, so every gateway instance agrees on the minute. */
export function minuteBucket(date: Date): string {
  return date.toISOString().slice(0, 16).replace(/[-T:]/g, '');
}

/** `2026-10-01T...` -> `202610`. */
export function monthBucket(date: Date): string {
  return date.toISOString().slice(0, 7).replace('-', '');
}

/** Whole seconds until the current minute ends; at least 1 so Retry-After is never 0. */
export function secondsUntilNextMinute(date: Date): number {
  return 60 - date.getUTCSeconds();
}

/**
 * Every Redis key the gateway uses, in one place.
 *
 * The braces around the tenant id are a Redis Cluster hash tag: all of a tenant's keys hash to the same
 * slot, so the multi-key Lua scripts that update a tenant counter and an API key counter together are
 * legal on a cluster. Circuit breaker keys are global per provider and need no tag.
 *
 *   tenant:{T}:requests:202610010930          requests this minute, whole tenant
 *   tenant:{T}:apikey:K:requests:202610010930 requests this minute, one API key
 *   tenant:{T}:tokens:202610010930            tokens this minute, whole tenant
 *   tenant:{T}:apikey:K:tokens:202610010930   tokens this minute, one API key
 *   tenant:{T}:budget:202610                  monthly budget hash
 *   provider:openai:circuit                   circuit breaker state (JSON)
 */
export const RedisKeys = {
  tenantRequests: (tenantId: string, minute: string) => `tenant:{${tenantId}}:requests:${minute}`,
  apiKeyRequests: (tenantId: string, apiKeyId: string, minute: string) =>
    `tenant:{${tenantId}}:apikey:${apiKeyId}:requests:${minute}`,
  tenantTokens: (tenantId: string, minute: string) => `tenant:{${tenantId}}:tokens:${minute}`,
  apiKeyTokens: (tenantId: string, apiKeyId: string, minute: string) =>
    `tenant:{${tenantId}}:apikey:${apiKeyId}:tokens:${minute}`,
  budget: (tenantId: string, month: string) => `tenant:{${tenantId}}:budget:${month}`,
  circuit: (provider: string) => `provider:${provider.toLowerCase()}:circuit`,
};
