import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { BudgetExceededException } from '../common/errors/traffic.exceptions';
import { logEvent } from '../common/logging/structured-logger';
import type { GatewayRequest } from '../common/types/gateway-request';
import { TrafficLimits } from '../traffic/plan-limits';
import { BudgetService } from './budget.service';

/**
 * Early exit for tenants that have already used their whole month: one cheap read, before the body is
 * validated or tokenized. It cannot know what this request would cost (that needs the validated body and
 * the chosen model), so the exact reservation happens later, in TrafficControlService.admit.
 */
@Injectable()
export class BudgetGuard implements CanActivate {
  constructor(
    private readonly budget: BudgetService,
    private readonly limits: TrafficLimits,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    if (!request.auth) throw GatewayErrors.missingApiKey();

    const { tenantId } = request.auth;
    const limit = this.limits.forAuth(request.auth).monthlyBudgetMicroUsd;
    const status = await this.budget.checkBudget(tenantId, limit);

    if (status.remaining <= 0) {
      logEvent(
        {
          event: 'budget_blocked',
          requestId: request.id,
          tenantId,
          requested: 0,
          remaining: status.remaining,
          monthlyLimit: status.monthlyLimit,
          unit: 'micro_usd',
        },
        'warn',
      );
      throw new BudgetExceededException();
    }
    return true;
  }
}
