import type { PrismaService } from '@tollbooth/database';
import type { Response } from 'express';
import type { RedisService } from './redis/redis.service';
import { HealthController } from './health.controller';

const passRes = { status: jest.fn().mockReturnThis() } as unknown as Response;

function build(opts: { dbOk?: boolean; redisOk?: boolean } = {}) {
  const { dbOk = true, redisOk = true } = opts;
  const prisma = {
    $queryRaw: jest.fn().mockImplementation(() =>
      dbOk ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('db down')),
    ),
  } as unknown as PrismaService;
  const redis = {
    health: jest.fn().mockResolvedValue({ healthy: redisOk, latencyMs: redisOk ? 1 : undefined }),
  } as unknown as RedisService;
  return new HealthController(prisma, redis);
}

describe('HealthController', () => {
  it('reports ok when postgres and redis are reachable', async () => {
    const result = await build().check(passRes);

    expect(result.status).toBe('ok');
    expect(result.service).toBe('gateway');
    expect(result.checks.postgres).toBe('ok');
    expect(result.checks.redis).toBe('ok');
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('reports degraded and 503 when postgres is down', async () => {
    const res = { status: jest.fn().mockReturnThis() } as unknown as Response;
    const result = await build({ dbOk: false }).check(res);

    expect(result.status).toBe('degraded');
    expect(result.checks.postgres).toBe('error');
    expect(result.checks.redis).toBe('ok');
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('reports degraded and 503 when redis is down', async () => {
    const res = { status: jest.fn().mockReturnThis() } as unknown as Response;
    const result = await build({ redisOk: false }).check(res);

    expect(result.status).toBe('degraded');
    expect(result.checks.redis).toBe('error');
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
