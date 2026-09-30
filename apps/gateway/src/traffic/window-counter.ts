import { Injectable } from '@nestjs/common';
import { COUNTER_TTL_SECONDS } from '../redis/redis.constants';
import { RedisService } from '../redis/redis.service';
import type { LuaScript } from '../redis/redis.service';

export type CounterScope = 'tenant' | 'key';

export interface ConsumeResult {
  allowed: boolean;
  /** Which counter refused the request. Null when it was allowed. */
  scope: CounterScope | null;
  tenantUsed: number;
  keyUsed: number;
}

/**
 * Check both counters, and only if neither would go over its limit, add to both. One script means
 * one atomic step on the Redis server, so no interleaving of concurrent requests can slip past a
 * limit, and:
 *
 *  - a refused request adds nothing (with "INCR then compare", rejected traffic would eat the quota of
 *    the well-behaved callers that share the counter);
 *  - the counter and its expiry are set together, so a crash cannot leave a counter that never expires.
 *
 * The tenant counter is checked first, so a tenant-wide limit is reported as such even when the key
 * limit would also have refused the request.
 */
const CONSUME: LuaScript = {
  name: 'tollboothConsume',
  keys: 2,
  lua: `
    local tenantUsed = tonumber(redis.call('GET', KEYS[1]) or '0')
    local keyUsed = tonumber(redis.call('GET', KEYS[2]) or '0')
    local amount = tonumber(ARGV[3])
    if tenantUsed + amount > tonumber(ARGV[1]) then return {0, 'tenant', tenantUsed, keyUsed} end
    if keyUsed + amount > tonumber(ARGV[2]) then return {0, 'key', tenantUsed, keyUsed} end
    tenantUsed = redis.call('INCRBY', KEYS[1], amount)
    if tenantUsed == amount then redis.call('EXPIRE', KEYS[1], ARGV[4]) end
    keyUsed = redis.call('INCRBY', KEYS[2], amount)
    if keyUsed == amount then redis.call('EXPIRE', KEYS[2], ARGV[4]) end
    return {1, '', tenantUsed, keyUsed}
  `,
};

/**
 * Corrects counters after the fact (a reservation was an estimate). Only touches counters that still
 * exist: if the minute has already rolled over, the counter is gone and the correction is moot, and
 * adjusting a missing key would create one with no expiry.
 */
const ADJUST: LuaScript = {
  name: 'tollboothAdjust',
  keys: 2,
  lua: `
    for i = 1, 2 do
      if redis.call('EXISTS', KEYS[i]) == 1 then
        local value = redis.call('INCRBY', KEYS[i], ARGV[1])
        if value < 0 then redis.call('SET', KEYS[i], 0, 'KEEPTTL') end
      end
    end
    return 1
  `,
};

/** A pair of per-minute counters (tenant-wide and per API key) that are consumed together. */
@Injectable()
export class WindowCounter {
  constructor(private readonly redis: RedisService) {}

  async consume(
    keys: [tenantKey: string, apiKeyKey: string],
    limits: [tenantLimit: number, apiKeyLimit: number],
    amount: number,
  ): Promise<ConsumeResult> {
    const [allowed, scope, tenantUsed, keyUsed] = (await this.redis.run(CONSUME, keys, [
      limits[0],
      limits[1],
      amount,
      COUNTER_TTL_SECONDS,
    ])) as [number, string, number, number];

    return {
      allowed: allowed === 1,
      scope: scope === 'tenant' || scope === 'key' ? scope : null,
      tenantUsed: Number(tenantUsed),
      keyUsed: Number(keyUsed),
    };
  }

  async adjust(keys: [string, string], delta: number): Promise<void> {
    if (delta === 0) return;
    await this.redis.run(ADJUST, keys, [delta]);
  }
}
