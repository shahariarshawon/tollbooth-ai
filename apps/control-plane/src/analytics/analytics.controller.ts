import { Controller, Get, Query } from '@nestjs/common';
import { CurrentTenantId, CurrentUser } from '../common/decorators/request.decorators';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { roleHasPermission } from '@tollbooth/shared';
import { AnalyticsService } from './analytics.service';
import type {
  AnalyticsCost,
  AnalyticsModels,
  AnalyticsOverview,
  AnalyticsUsage,
} from './analytics.types';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/**
 * Access control (Phase 10, Task 5): every endpoint needs at least VIEW_ANALYTICS, which
 * TENANT_ADMIN, DEVELOPER and FINANCE all hold ("usage" is visible to everyone who can see this
 * section at all). Cost figures additionally need VIEW_BILLING, which only TENANT_ADMIN and FINANCE
 * hold: a DEVELOPER gets `usage` and `models` with `cost: null`, and `overview` with `totalCost: null`,
 * and cannot call `/analytics/cost` at all (403). This reuses the permission matrix Phase 2 already
 * defined (`packages/shared/src/permissions.ts`); nothing here changes it.
 */
@Controller('analytics')
@RequirePermission(Permission.VIEW_ANALYTICS)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsOverview> {
    return this.analytics.overview(tenantId, query.days, canViewCost(actor));
  }

  @Get('usage')
  usage(
    @CurrentTenantId() tenantId: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsUsage> {
    return this.analytics.usage(tenantId, query.days);
  }

  @Get('models')
  models(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsModels> {
    return this.analytics.models(tenantId, query.days, canViewCost(actor));
  }

  @Get('cost')
  @RequirePermission(Permission.VIEW_ANALYTICS, Permission.VIEW_BILLING)
  cost(
    @CurrentTenantId() tenantId: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsCost> {
    return this.analytics.cost(tenantId, query.days);
  }
}

function canViewCost(actor: AuthenticatedUser): boolean {
  return roleHasPermission(actor.role, Permission.VIEW_BILLING);
}
