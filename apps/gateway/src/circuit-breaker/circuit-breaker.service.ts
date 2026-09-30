import { Inject, Injectable } from '@nestjs/common';
import { logEvent } from '../common/logging/structured-logger';
import { RedisKeys } from '../redis/redis.constants';
import { RedisService } from '../redis/redis.service';
import type { LuaScript } from '../redis/redis.service';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Consecutive failures (inside the window) that open the circuit. */
  failureThreshold: number;
  /** How long an open circuit refuses calls before letting one trial through. */
  openMs: number;
  /** Failures further apart than this do not add up. */
  failureWindowMs: number;
  /** Successful trial calls needed in HALF_OPEN to close the circuit again. */
  successesToClose: number;
  /** A trial call that never reports back frees its slot after this long. */
  probeTimeoutMs: number;
}

export const CIRCUIT_OPTIONS = Symbol('CIRCUIT_OPTIONS');

export interface CircuitDecision {
  allowed: boolean;
  state: CircuitState;
  /** When refused: seconds until a trial call will be allowed. */
  retryAfterSeconds: number;
}

/** The stored state, as in the `provider:{name}:circuit` key. An absent key means CLOSED with no failures. */
export interface CircuitSnapshot {
  state: CircuitState;
  failureCount: number;
  /** ISO timestamp of the latest failure, if any. */
  lastFailure: string | null;
}

/**
 * The state machine runs inside Redis as Lua, so every gateway instance shares one view of a provider
 * and two instances can never both decide they are the trial call.
 *
 * Stored as JSON: { state, failureCount, lastFailure, lastFailureAt, openedAt, successCount, probing, probeStartedAt }
 */

const CAN_REQUEST: LuaScript = {
  name: 'tollboothCircuitCanRequest',
  keys: 1,
  lua: `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return {1, 'CLOSED', 0} end
    local s = cjson.decode(raw)
    local now = tonumber(ARGV[1])
    local openMs = tonumber(ARGV[2])
    local probeTimeout = tonumber(ARGV[3])

    if s.state == 'CLOSED' then return {1, 'CLOSED', 0} end

    if s.state == 'OPEN' then
      local elapsed = now - s.openedAt
      if elapsed < openMs then return {0, 'OPEN', openMs - elapsed} end
      -- The wait is over: this caller becomes the trial call.
      s.state = 'HALF_OPEN'
      s.successCount = 0
      s.probing = 1
      s.probeStartedAt = now
      redis.call('SET', KEYS[1], cjson.encode(s))
      return {1, 'HALF_OPEN', 0}
    end

    -- HALF_OPEN: one trial call at a time.
    if s.probing == 1 and (now - s.probeStartedAt) < probeTimeout then
      return {0, 'HALF_OPEN', probeTimeout - (now - s.probeStartedAt)}
    end
    s.probing = 1
    s.probeStartedAt = now
    redis.call('SET', KEYS[1], cjson.encode(s))
    return {1, 'HALF_OPEN', 0}
  `,
};

const RECORD_FAILURE: LuaScript = {
  name: 'tollboothCircuitRecordFailure',
  keys: 1,
  lua: `
    local raw = redis.call('GET', KEYS[1])
    local s
    if raw then s = cjson.decode(raw) else s = {state = 'CLOSED', failureCount = 0, successCount = 0, probing = 0} end
    local previous = s.state
    local now = tonumber(ARGV[1])
    local threshold = tonumber(ARGV[3])
    local window = tonumber(ARGV[4])

    if s.state == 'HALF_OPEN' then
      -- The trial call failed: back to OPEN for another full wait.
      s.state = 'OPEN'
      s.openedAt = now
      s.probing = 0
      s.failureCount = s.failureCount + 1
    elseif s.state == 'OPEN' then
      -- A call that started before the circuit opened, finishing late. Only the record changes.
      s.failureCount = s.failureCount + 1
    else
      if s.lastFailureAt and (now - s.lastFailureAt) > window then s.failureCount = 0 end
      s.failureCount = s.failureCount + 1
      if s.failureCount >= threshold then
        s.state = 'OPEN'
        s.openedAt = now
      end
    end
    s.lastFailure = ARGV[2]
    s.lastFailureAt = now
    redis.call('SET', KEYS[1], cjson.encode(s))
    return {previous, s.state, s.failureCount}
  `,
};

const RECORD_SUCCESS: LuaScript = {
  name: 'tollboothCircuitRecordSuccess',
  keys: 1,
  lua: `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return {'CLOSED', 'CLOSED', 0} end
    local s = cjson.decode(raw)

    if s.state == 'CLOSED' then
      -- A success ends the run of failures. Deleting the key is how "healthy" is stored.
      redis.call('DEL', KEYS[1])
      return {'CLOSED', 'CLOSED', 0}
    end

    if s.state == 'HALF_OPEN' then
      s.successCount = (s.successCount or 0) + 1
      s.probing = 0
      if s.successCount >= tonumber(ARGV[1]) then
        redis.call('DEL', KEYS[1])
        return {'HALF_OPEN', 'CLOSED', 0}
      end
      redis.call('SET', KEYS[1], cjson.encode(s))
      return {'HALF_OPEN', 'HALF_OPEN', s.failureCount}
    end

    -- OPEN: a call that started before the circuit opened succeeded late. It proves nothing about now.
    return {'OPEN', 'OPEN', s.failureCount}
  `,
};

/**
 * Tracks whether an AI provider is healthy, so the gateway stops sending traffic to one that is down
 * instead of making every caller wait for a timeout.
 *
 *   CLOSED --(N consecutive failures)--> OPEN --(wait elapsed)--> HALF_OPEN
 *      ^                                  ^                          |
 *      |                                  +------(trial fails)-------+
 *      +---------(trial calls succeed)--------------------------------+
 *
 * The breaker is advisory: if Redis cannot be reached it lets requests through rather than blocking
 * all AI traffic because a cache is unavailable.
 */
@Injectable()
export class CircuitBreakerService {
  constructor(
    private readonly redis: RedisService,
    @Inject(CIRCUIT_OPTIONS) private readonly options: CircuitBreakerOptions,
  ) {}

  /** Whether a call to `provider` may go ahead. A HALF_OPEN approval is the trial call. */
  async canRequest(provider: string, now: number = Date.now()): Promise<CircuitDecision> {
    try {
      const [allowed, state, retryAfterMs] = (await this.redis.run(
        CAN_REQUEST,
        [RedisKeys.circuit(provider)],
        [now, this.options.openMs, this.options.probeTimeoutMs],
      )) as [number, CircuitState, number];

      if (allowed === 1 && state === 'HALF_OPEN') {
        logEvent({ event: 'circuit_trial_request', provider: provider.toLowerCase() }, 'warn');
      }
      return {
        allowed: allowed === 1,
        state,
        retryAfterSeconds: Math.max(1, Math.ceil(Number(retryAfterMs) / 1000)),
      };
    } catch (error) {
      this.logUnavailable('can_request', provider, error);
      return { allowed: true, state: 'CLOSED', retryAfterSeconds: 0 };
    }
  }

  /** The provider answered the call. Ends a run of failures; enough trial successes close the circuit. */
  async recordSuccess(provider: string): Promise<void> {
    try {
      const [from, to, failureCount] = (await this.redis.run(
        RECORD_SUCCESS,
        [RedisKeys.circuit(provider)],
        [this.options.successesToClose],
      )) as [CircuitState, CircuitState, number];
      this.logTransition(provider, from, to, Number(failureCount));
    } catch (error) {
      this.logUnavailable('record_success', provider, error);
    }
  }

  /** The provider failed (timeout, outage, rate limited, rejected our credentials). */
  async recordFailure(provider: string, now: number = Date.now()): Promise<void> {
    try {
      const [from, to, failureCount] = (await this.redis.run(
        RECORD_FAILURE,
        [RedisKeys.circuit(provider)],
        [
          now,
          new Date(now).toISOString(),
          this.options.failureThreshold,
          this.options.failureWindowMs,
        ],
      )) as [CircuitState, CircuitState, number];
      this.logTransition(provider, from, to, Number(failureCount));
    } catch (error) {
      this.logUnavailable('record_failure', provider, error);
    }
  }

  /** The stored state, for operators and tests. Throws if Redis is unreachable. */
  async getState(provider: string): Promise<CircuitSnapshot> {
    const raw = await this.redis.client.get(RedisKeys.circuit(provider));
    if (!raw) return { state: 'CLOSED', failureCount: 0, lastFailure: null };
    const stored = JSON.parse(raw) as Partial<CircuitSnapshot>;
    return {
      state: stored.state ?? 'CLOSED',
      failureCount: stored.failureCount ?? 0,
      lastFailure: stored.lastFailure ?? null,
    };
  }

  private logTransition(
    provider: string,
    from: CircuitState,
    to: CircuitState,
    failureCount: number,
  ) {
    if (from === to) return;
    logEvent(
      { event: 'circuit_state_changed', provider: provider.toLowerCase(), from, to, failureCount },
      to === 'OPEN' ? 'error' : 'warn',
    );
  }

  private logUnavailable(action: string, provider: string, error: unknown) {
    logEvent(
      {
        event: 'circuit_breaker_redis_failure',
        action,
        provider: provider.toLowerCase(),
        message: error instanceof Error ? error.message : 'unknown error',
      },
      'error',
    );
  }
}
