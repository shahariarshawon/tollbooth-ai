import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentTenantId, CurrentUser } from '../common/decorators/request.decorators';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { BillingService } from './billing.service';
import type { BillingSummary } from './billing.service';
import {
  AssignSubscriptionDto,
  CreateBillingPlanDto,
  UpdateBillingLimitsDto,
} from './dto/billing.dto';

@Controller('billing')
@RequirePermission(Permission.VIEW_BILLING)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('summary')
  getSummary(@CurrentTenantId() tenantId: string): Promise<BillingSummary> {
    return this.billing.getSummary(tenantId);
  }

  @Get('history')
  getHistory(
    @CurrentTenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.billing.getHistory(
      tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('plans')
  listPlans(): Promise<any[]> {
    return this.billing.listPlans();
  }

  @Post('plans')
  @RequirePermission(Permission.MANAGE_BILLING)
  createPlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateBillingPlanDto,
  ): Promise<any> {
    return this.billing.createPlan(dto, actor.userId);
  }

  @Post('subscription')
  @RequirePermission(Permission.MANAGE_BILLING)
  assignSubscription(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AssignSubscriptionDto,
  ): Promise<any> {
    return this.billing.assignSubscription(tenantId, dto, actor.userId);
  }

  @Patch('limits')
  @RequirePermission(Permission.MANAGE_BILLING)
  updateLimits(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateBillingLimitsDto,
  ): Promise<any> {
    return this.billing.updateLimits(tenantId, dto, actor.userId);
  }
}
