import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RedisService } from './redis.service';

/** GET /health/redis. Public, like /health, so load balancers and monitors can poll it. */
@Controller('health')
export class RedisHealthController {
  constructor(private readonly redis: RedisService) {}

  @Get('redis')
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'healthy'; latency: string } | { status: 'unhealthy'; error: string }> {
    const health = await this.redis.health();
    if (health.healthy) return { status: 'healthy', latency: `${health.latencyMs}ms` };

    response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: 'unhealthy', error: health.error ?? 'Redis is not reachable' };
  }
}
