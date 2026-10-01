import type { PrismaService } from '@tollbooth/database';
import type { Response } from 'express';
import { HealthController } from './health.controller';

const passRes = { status: jest.fn().mockReturnThis() } as unknown as Response;

function build(dbOk = true) {
  const prisma = {
    $queryRaw: jest.fn().mockImplementation(() =>
      dbOk ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('db down')),
    ),
  } as unknown as PrismaService;
  return new HealthController(prisma);
}

describe('HealthController', () => {
  it('reports ok when postgres is reachable', async () => {
    const result = await build().check(passRes);

    expect(result.status).toBe('ok');
    expect(result.service).toBe('control-plane');
    expect(result.checks.postgres).toBe('ok');
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('reports degraded and 503 when postgres is down', async () => {
    const res = { status: jest.fn().mockReturnThis() } as unknown as Response;
    const result = await build(false).check(res);

    expect(result.status).toBe('degraded');
    expect(result.checks.postgres).toBe('error');
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
