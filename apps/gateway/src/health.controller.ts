import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type { Response } from 'express';
import { RedisService } from './redis/redis.service';

interface HealthDetail {
  status: 'ok' | 'degraded';
  service: string;
  uptimeSeconds: number;
  checks: {
    postgres: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthDetail> {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.health(),
    ]);

    const dbOk = dbResult.status === 'fulfilled';
    const redisOk = redisResult.status === 'fulfilled' && redisResult.value.healthy;
    const healthy = dbOk && redisOk;

    if (!healthy) res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: healthy ? 'ok' : 'degraded',
      service: 'gateway',
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        postgres: dbOk ? 'ok' : 'error',
        redis: redisOk ? 'ok' : 'error',
      },
    };
  }
}
