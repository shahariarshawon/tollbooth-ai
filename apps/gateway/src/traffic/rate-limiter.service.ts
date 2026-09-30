import { Injectable } from '@nestjs/common';
import type { ApiKeyAuth } from '../common/types/gateway-request';
import { RedisFailurePolicy } from '../redis/redis-failure.policy';
import { RedisKeys, minuteBucket, secondsUntilNextMinute } from '../redis/redis.constants';
import type { CounterScope } from './window-counter';
import { WindowCounter } from './window-counter';
import type { ResolvedLimits } from './plan-limits';

export interface RateLimitDecision {
  allowed: boolean;
  /** Which limit refused the request, when one did. */
  scope: CounterScope | null;
  /** The limit that matters for this decision: the one that refused, or the tightest one. */
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
  /** True when Redis was down and the gateway is failing open, so no limit was applied. */
  bypassed: boolean;
}

/**
 * Request rate limiting per tenant and per API key, in fixed one-minute windows.
 *
 * Fixed windows are cheap (one key per counter per minute, no per-request bookkeeping) and easy to
 * reason about. Their known weakness is that a caller can send a full limit at the end of one minute and
 * another at the start of the next, briefly doubling the rate; a sliding window would remove that at
 * the price of more Redis work per request.
 */
@Injectable()
export class RateLimiterService {
  constructor(
    private readonly counter: WindowCounter,
    private readonly policy: RedisFailurePolicy,
  ) {}

  check(
    auth: Pick<ApiKeyAuth, 'tenantId' | 'apiKeyId'>,
    limits: Pick<ResolvedLimits, 'tenantRequests' | 'keyRequests'>,
    now: Date = new Date(),
  ): Promise<RateLimitDecision> {
    const minute = minuteBucket(now);
    const resetSeconds = secondsUntilNextMinute(now);
    const bypass: RateLimitDecision = {
      allowed: true,
      scope: null,
      limit: limits.keyRequests,
      remaining: limits.keyRequests,
      resetSeconds,
      bypassed: true,
    };

    return this.policy.guard(
      'rate_limit',
      async () => {
        const result = await this.counter.consume(
          [
            RedisKeys.tenantRequests(auth.tenantId, minute),
            RedisKeys.apiKeyRequests(auth.tenantId, auth.apiKeyId, minute),
          ],
          [limits.tenantRequests, limits.keyRequests],
          1,
        );

        const tenantRemaining = limits.tenantRequests - result.tenantUsed;
        const keyRemaining = limits.keyRequests - result.keyUsed;
        const tenantIsTighter = tenantRemaining <= keyRemaining;
        // A refusal reports the limit that refused; otherwise report whichever is closest to running out.
        const useTenant = result.scope ? result.scope === 'tenant' : tenantIsTighter;

        return {
          allowed: result.allowed,
          scope: result.scope,
          limit: useTenant ? limits.tenantRequests : limits.keyRequests,
          remaining: Math.max(0, useTenant ? tenantRemaining : keyRemaining),
          resetSeconds,
          bypassed: false,
        };
      },
      bypass,
    );
  }
}
