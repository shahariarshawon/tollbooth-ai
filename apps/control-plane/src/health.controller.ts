import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type { Response } from 'express';
import { Public } from './common/decorators/public.decorator';

interface HealthDetail {
  status: 'ok' | 'degraded';
  service: string;
  uptimeSeconds: number;
  checks: { postgres: 'ok' | 'error' };
}

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthDetail> {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      // DB unavailable
    }

    if (!dbOk) res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'control-plane',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { postgres: dbOk ? 'ok' : 'error' },
    };
  }
}
