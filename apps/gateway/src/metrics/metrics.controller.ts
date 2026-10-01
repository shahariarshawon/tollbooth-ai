import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { metricsRegistry } from './metrics';

/** GET /metrics — Prometheus scrape endpoint. Not authenticated: Prometheus pulls from an internal network. */
@Controller('metrics')
export class MetricsController {
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    const output = await metricsRegistry.metrics();
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(output);
  }
}
