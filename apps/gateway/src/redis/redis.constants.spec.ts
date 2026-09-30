import { RedisKeys, minuteBucket, monthBucket, secondsUntilNextMinute } from './redis.constants';

describe('time buckets', () => {
  it('formats the minute as 12 UTC digits', () => {
    expect(minuteBucket(new Date('2026-10-01T09:30:12.345Z'))).toBe('202610010930');
    expect(minuteBucket(new Date('2026-12-31T23:59:59.999Z'))).toBe('202612312359');
    expect(minuteBucket(new Date('2027-01-01T00:00:00.000Z'))).toBe('202701010000');
  });

  it('gives every instant of a minute the same bucket and the next minute a new one', () => {
    const start = minuteBucket(new Date('2026-10-01T09:30:00.000Z'));
    expect(minuteBucket(new Date('2026-10-01T09:30:59.999Z'))).toBe(start);
    expect(minuteBucket(new Date('2026-10-01T09:31:00.000Z'))).not.toBe(start);
  });

  it('formats the month', () => {
    expect(monthBucket(new Date('2026-10-01T00:00:00.000Z'))).toBe('202610');
    expect(monthBucket(new Date('2026-01-31T23:59:59.000Z'))).toBe('202601');
  });

  it('counts the seconds left in the minute, never less than 1', () => {
    expect(secondsUntilNextMinute(new Date('2026-10-01T09:30:10.000Z'))).toBe(50);
    expect(secondsUntilNextMinute(new Date('2026-10-01T09:30:00.000Z'))).toBe(60);
    expect(secondsUntilNextMinute(new Date('2026-10-01T09:30:59.900Z'))).toBe(1);
  });
});

describe('RedisKeys', () => {
  const tenant = '3f2a9c1e-0000-4000-8000-000000000001';
  const key = '7b7d1a0c-0000-4000-8000-000000000002';

  it('builds the documented key names', () => {
    expect(RedisKeys.tenantRequests(tenant, '202610010930')).toBe(
      `tenant:{${tenant}}:requests:202610010930`,
    );
    expect(RedisKeys.tenantTokens(tenant, '202610010930')).toBe(
      `tenant:{${tenant}}:tokens:202610010930`,
    );
    expect(RedisKeys.apiKeyRequests(tenant, key, '202610010930')).toBe(
      `tenant:{${tenant}}:apikey:${key}:requests:202610010930`,
    );
    expect(RedisKeys.apiKeyTokens(tenant, key, '202610010930')).toBe(
      `tenant:{${tenant}}:apikey:${key}:tokens:202610010930`,
    );
    expect(RedisKeys.budget(tenant, '202610')).toBe(`tenant:{${tenant}}:budget:202610`);
    expect(RedisKeys.circuit('OpenAI')).toBe('provider:openai:circuit');
  });

  it('puts every key of a tenant in one cluster slot through the {tenant} hash tag', () => {
    const tag = (redisKey: string) => /\{([^}]+)\}/.exec(redisKey)?.[1];
    const keys = [
      RedisKeys.tenantRequests(tenant, 'm'),
      RedisKeys.apiKeyRequests(tenant, key, 'm'),
      RedisKeys.tenantTokens(tenant, 'm'),
      RedisKeys.apiKeyTokens(tenant, key, 'm'),
      RedisKeys.budget(tenant, 'm'),
    ];
    expect(new Set(keys.map(tag))).toEqual(new Set([tenant]));
  });

  it('keeps different tenants in different keys', () => {
    expect(RedisKeys.tenantRequests('a', 'm')).not.toBe(RedisKeys.tenantRequests('b', 'm'));
  });
});
