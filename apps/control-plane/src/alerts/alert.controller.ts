import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import type { Alert } from '@tollbooth/database';
import { CurrentTenantId } from '../common/decorators/request.decorators';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { Page } from '../common/dto/pagination-query.dto';
import { AlertService } from './alert.service';

/**
 * Task 6's three endpoints. No `@RequirePermission` here: like `GET /tenants/:id`, any authenticated
 * member of the tenant may see and acknowledge its own alerts — they are operational notices for the
 * whole tenant, not a role-restricted resource the way billing or user management are.
 */
@Controller('alerts')
export class AlertController {
  constructor(private readonly alerts: AlertService) {}

  @Get()
  list(
    @CurrentTenantId() tenantId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Page<Alert>> {
    return this.alerts.list(tenantId, query.limit, query.offset);
  }

  @Get('unread')
  unread(@CurrentTenantId() tenantId: string): Promise<Alert[]> {
    return this.alerts.unread(tenantId);
  }

  @Patch(':id/read')
  markRead(
    @CurrentTenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Alert> {
    return this.alerts.markRead(tenantId, id);
  }
}
