import { Injectable } from '@nestjs/common';
import { BudgetExceededException } from '../common/errors/traffic.exceptions';
import { logEvent } from '../common/logging/structured-logger';
import { RedisFailurePolicy } from '../redis/redis-failure.policy';
import { BUDGET_TTL_SECONDS, RedisKeys, monthBucket } from '../redis/redis.constants';
import { RedisService } from '../redis/redis.service';
import type { LuaScript } from '../redis/redis.service';

/**
 * The budget of a tenant for one month, as stored in the hash `tenant:{T}:budget:{YYYYMM}`:
 *
 *   monthlyLimit  the cap, refreshed from the plan on every reservation so a plan change applies at once
 *   currentUsage  money already spent (settled)
 *   reserved      money held for requests still in flight
 *   remaining     monthlyLimit - currentUsage - reserved, kept up to date by every script
 *
 * All amounts are micro-dollars.
 */
export interface BudgetStatus {
  allowed: boolean;
  monthlyLimit: number;
  currentUsage: number;
  reserved: number;
  remaining: number;
  /** True when Redis was down and the gateway is failing open, so nothing was checked. */
  bypassed: boolean;
}

/** Money held for one in-flight request. Pass it back to release or settle it. */
export interface BudgetReservation {
  tenantId: string;
  month: string;
  amountMicroUsd: number;
}

// Every script ends by recomputing `remaining`, so the four fields always agree.
const RECOMPUTE = `
  remaining = limit - usage - reserved
  redis.call('HSET', KEYS[1], 'monthlyLimit', limit, 'currentUsage', usage, 'reserved', reserved, 'remaining', remaining)
`;

const READ = `
  local limit = tonumber(ARGV[1])
  local usage = tonumber(redis.call('HGET', KEYS[1], 'currentUsage') or '0')
  local reserved = tonumber(redis.call('HGET', KEYS[1], 'reserved') or '0')
  local remaining = limit - usage - reserved
`;

// Release and settle do not know the plan limit, so they keep whatever limit is already stored.
const READ_STORED = `
  local limit = tonumber(redis.call('HGET', KEYS[1], 'monthlyLimit') or '0')
  local usage = tonumber(redis.call('HGET', KEYS[1], 'currentUsage') or '0')
  local reserved = tonumber(redis.call('HGET', KEYS[1], 'reserved') or '0')
  local remaining = limit - usage - reserved
`;

/** Read only: what would happen if `amount` were reserved now. Creates nothing. */
const CHECK: LuaScript = {
  name: 'tollboothBudgetCheck',
  keys: 1,
  lua: `
    ${READ}
    local allowed = 0
    if tonumber(ARGV[2]) <= remaining then allowed = 1 end
    return {allowed, limit, usage, reserved, remaining}
  `,
};

/** Check and hold in one atomic step, so concurrent requests cannot jointly overspend. */
const RESERVE: LuaScript = {
  name: 'tollboothBudgetReserve',
  keys: 1,
  lua: `
    ${READ}
    local amount = tonumber(ARGV[2])
    local allowed = 0
    if amount <= remaining then
      reserved = reserved + amount
      allowed = 1
    end
    ${RECOMPUTE}
    redis.call('EXPIRE', KEYS[1], ARGV[3])
    return {allowed, limit, usage, reserved, remaining}
  `,
};

/** Give back a hold that was not used. */
const RELEASE: LuaScript = {
  name: 'tollboothBudgetRelease',
  keys: 1,
  lua: `
    if redis.call('EXISTS', KEYS[1]) == 0 then return {1, 0, 0, 0, 0} end
    ${READ_STORED}
    reserved = math.max(0, reserved - tonumber(ARGV[1]))
    ${RECOMPUTE}
    return {1, limit, usage, reserved, remaining}
  `,
};

/** Turn a hold into real spend: drop the estimate, add the actual cost. */
const SETTLE: LuaScript = {
  name: 'tollboothBudgetSettle',
  keys: 1,
  lua: `
    ${READ_STORED}
    reserved = math.max(0, reserved - tonumber(ARGV[1]))
    usage = usage + tonumber(ARGV[3])
    ${RECOMPUTE}
    redis.call('EXPIRE', KEYS[1], ARGV[2])
    return {1, limit, usage, reserved, remaining}
  `,
};

type ScriptReply = [number, number, number, number, number];

function toStatus(reply: ScriptReply): BudgetStatus {
  const [allowed, monthlyLimit, currentUsage, reserved, remaining] = reply.map(
    Number,
  ) as ScriptReply;
  return {
    allowed: allowed === 1,
    monthlyLimit,
    currentUsage,
    reserved,
    remaining,
    bypassed: false,
  };
}

/**
 * Fast budget enforcement in front of the AI call.
 *
 * The flow for one request: `reserveBudget` holds the worst-case cost, then after the call either
 * `updateUsage` swaps the hold for the real cost or `releaseBudget` returns it. Because the hold is
 * taken before the call, simultaneous requests cannot each see "enough left" and together overspend.
 *
 * Redis holds the running figures for speed; it is a cache of spend, not the record of it. The record
 * is `ai_requests`, which the billing phase will use to rebuild these counters if Redis is ever lost.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly redis: RedisService,
    private readonly policy: RedisFailurePolicy,
  ) {}

  /** What is left, and whether `amountMicroUsd` would fit. Does not change anything. */
  checkBudget(
    tenantId: string,
    monthlyLimitMicroUsd: number,
    amountMicroUsd = 0,
    now: Date = new Date(),
  ): Promise<BudgetStatus> {
    const bypass: BudgetStatus = {
      allowed: true,
      monthlyLimit: monthlyLimitMicroUsd,
      currentUsage: 0,
      reserved: 0,
      remaining: monthlyLimitMicroUsd,
      bypassed: true,
    };
    return this.policy.guard(
      'budget_check',
      async () =>
        toStatus(
          (await this.redis.run(
            CHECK,
            [RedisKeys.budget(tenantId, monthBucket(now))],
            [monthlyLimitMicroUsd, amountMicroUsd],
          )) as ScriptReply,
        ),
      bypass,
    );
  }

  /**
   * Holds `amountMicroUsd` against the month. Throws 402 when it does not fit. Returns null when the
   * gateway is failing open because Redis is down.
   */
  async reserveBudget(
    tenantId: string,
    monthlyLimitMicroUsd: number,
    amountMicroUsd: number,
    context: { requestId?: string } = {},
    now: Date = new Date(),
  ): Promise<BudgetReservation | null> {
    const month = monthBucket(now);
    const status = await this.policy.guard(
      'budget_reserve',
      async () =>
        toStatus(
          (await this.redis.run(
            RESERVE,
            [RedisKeys.budget(tenantId, month)],
            [monthlyLimitMicroUsd, amountMicroUsd, BUDGET_TTL_SECONDS],
          )) as ScriptReply,
        ),
      null,
    );
    if (status === null) return null;

    if (!status.allowed) {
      logEvent(
        {
          event: 'budget_blocked',
          requestId: context.requestId,
          tenantId,
          requested: amountMicroUsd,
          remaining: status.remaining,
          monthlyLimit: status.monthlyLimit,
          unit: 'micro_usd',
        },
        'warn',
      );
      throw new BudgetExceededException();
    }
    return { tenantId, month, amountMicroUsd };
  }

  /** The request did not spend anything (it failed, or was refused later): return the hold. */
  async releaseBudget(reservation: BudgetReservation | null): Promise<void> {
    if (!reservation) return;
    await this.quietly('budget_release', () =>
      this.redis.run(
        RELEASE,
        [RedisKeys.budget(reservation.tenantId, reservation.month)],
        [reservation.amountMicroUsd],
      ),
    );
  }

  /** The request finished: replace the hold with what it actually cost. */
  async updateUsage(reservation: BudgetReservation | null, actualMicroUsd: number): Promise<void> {
    if (!reservation) return;
    await this.quietly('budget_update_usage', () =>
      this.redis.run(
        SETTLE,
        [RedisKeys.budget(reservation.tenantId, reservation.month)],
        [reservation.amountMicroUsd, BUDGET_TTL_SECONDS, actualMicroUsd],
      ),
    );
  }

  /** The figures as stored, for operators and tests. Null if the tenant has no budget key this month. */
  async snapshot(tenantId: string, now: Date = new Date()): Promise<Record<string, number> | null> {
    const hash = await this.redis.client.hgetall(RedisKeys.budget(tenantId, monthBucket(now)));
    if (Object.keys(hash).length === 0) return null;
    return Object.fromEntries(Object.entries(hash).map(([field, value]) => [field, Number(value)]));
  }

  /** The caller has already been answered, so a failed bookkeeping write is logged, not raised. */
  private async quietly(control: string, operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      logEvent(
        {
          event: `${control}_failed`,
          message: error instanceof Error ? error.message : 'unknown error',
        },
        'error',
      );
    }
  }
}
