import { Controller, Get } from '@nestjs/common';
import { buildHealthResponse } from '@tollbooth/shared';
import type { HealthResponse } from '@tollbooth/shared';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return buildHealthResponse('control-plane');
  }
}
