import { Injectable } from '@nestjs/common';
import { RateLimitExceededException } from '../common/errors/traffic.exceptions';
import { logEvent } from '../common/logging/structured-logger';
import type { ApiKeyAuth } from '../common/types/gateway-request';
import { RedisFailurePolicy } from '../redis/redis-failure.policy';
import { RedisKeys, minuteBucket, secondsUntilNextMinute } from '../redis/redis.constants';
import type { ResolvedLimits } from './plan-limits';
import { WindowCounter } from './window-counter';

/** Tokens held against the minute counters while a request is in flight. */
export interface TokenReservation {
  keys: [tenantKey: string, apiKeyKey: string];
  tokens: number;
}

/**
 * Tokens per minute, per tenant and per API key.
 *
 * The true token count is only known after the provider answers, but waiting until then would let a
 * burst of concurrent requests all pass the check. So a request first reserves an estimate (its input
 * plus the most it may generate) atomically, and afterwards the reservation is corrected to what was
 * really used, or refunded if the call failed.
 */
@Injectable()
export class TokenQuotaService {
  constructor(
    private readonly counter: WindowCounter,
    private readonly policy: RedisFailurePolicy,
  ) {}

  /** Reserves `tokens`. Throws 429 if either limit would be exceeded. Returns null if limits are bypassed. */
  async reserve(
    auth: Pick<ApiKeyAuth, 'tenantId' | 'apiKeyId'>,
    limits: Pick<ResolvedLimits, 'tenantTokens' | 'keyTokens'>,
    tokens: number,
    context: { requestId?: string } = {},
    now: Date = new Date(),
  ): Promise<TokenReservation | null> {
    const minute = minuteBucket(now);
    const keys: TokenReservation['keys'] = [
      RedisKeys.tenantTokens(auth.tenantId, minute),
      RedisKeys.apiKeyTokens(auth.tenantId, auth.apiKeyId, minute),
    ];

    const result = await this.policy.guard(
      'token_quota',
      () => this.counter.consume(keys, [limits.tenantTokens, limits.keyTokens], tokens),
      null,
    );
    if (result === null) return null;

    if (!result.allowed) {
      const limit = result.scope === 'tenant' ? limits.tenantTokens : limits.keyTokens;
      logEvent(
        {
          event: 'token_quota_blocked',
          requestId: context.requestId,
          tenantId: auth.tenantId,
          apiKeyId: auth.apiKeyId,
          scope: result.scope,
          limit,
          requested: tokens,
          used: result.scope === 'tenant' ? result.tenantUsed : result.keyUsed,
          window: '1m',
        },
        'warn',
      );
      throw new RateLimitExceededException(
        result.scope === 'tenant'
          ? 'Token limit exceeded for this account. Please retry later.'
          : 'Token limit exceeded for this API key. Please retry later.',
        secondsUntilNextMinute(now),
        { 'X-RateLimit-Limit-Tokens': String(limit) },
      );
    }
    return { keys, tokens };
  }

  /** The call finished: replace the estimate with what was actually used. */
  async commit(reservation: TokenReservation | null, actualTokens: number): Promise<void> {
    if (!reservation) return;
    await this.adjustQuietly(reservation, actualTokens - reservation.tokens);
  }

  /** The call did not happen or failed: give the whole reservation back. */
  async release(reservation: TokenReservation | null): Promise<void> {
    if (!reservation) return;
    await this.adjustQuietly(reservation, -reservation.tokens);
  }

  /** The caller has already been answered, so a failed correction is logged, never raised. */
  private async adjustQuietly(reservation: TokenReservation, delta: number): Promise<void> {
    try {
      await this.counter.adjust(reservation.keys, delta);
    } catch (error) {
      logEvent(
        {
          event: 'token_quota_adjust_failed',
          message: error instanceof Error ? error.message : 'unknown error',
        },
        'error',
      );
    }
  }
}
