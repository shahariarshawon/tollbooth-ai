import { Controller, Get, Query } from '@nestjs/common';
import { roleHasPermission } from '@tollbooth/shared';
import type { DashboardOverview } from '@tollbooth/shared';
import { AnalyticsQueryDto } from '../analytics/dto/analytics-query.dto';
import { CurrentTenantId, CurrentUser } from '../common/decorators/request.decorators';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { DashboardService } from './dashboard.service';

/**
 * The dashboard's landing page. Everyone who can see analytics can see the overview; money figures
 * (cost, cost trend, budget) additionally need VIEW_BILLING and are null otherwise, exactly as in
 * /analytics.
 */
@Controller('dashboard')
@RequirePermission(Permission.VIEW_ANALYTICS)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  overview(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AnalyticsQueryDto,
  ): Promise<DashboardOverview> {
    return this.dashboard.overview(
      tenantId,
      query.days,
      roleHasPermission(actor.role, Permission.VIEW_BILLING),
    );
  }
}
