import { Inject, Injectable } from '@nestjs/common';
import type { TenantPlan } from '@tollbooth/database';
import type { ApiKeyAuth } from '../common/types/gateway-request';

export interface PlanLimits {
  /** Requests per minute for the whole tenant, across all of its keys. */
  requestsPerMinute: number;
  /** Requests per minute for one API key that has no limit of its own. */
  keyRequestsPerMinute: number;
  tokensPerMinute: number;
  keyTokensPerMinute: number;
  /** USD a tenant may spend per calendar month. */
  monthlyBudgetUsd: number;
}

/**
 * What each plan allows. These are the defaults until limits become editable per tenant, which needs
 * columns on the tenants table. A key's own `rateLimit` (set when the key is created) overrides the
 * per-key request figure.
 */
export const DEFAULT_PLAN_LIMITS: Record<TenantPlan, PlanLimits> = {
  FREE: {
    requestsPerMinute: 60,
    keyRequestsPerMinute: 20,
    tokensPerMinute: 40_000,
    keyTokensPerMinute: 20_000,
    monthlyBudgetUsd: 10,
  },
  STARTUP: {
    requestsPerMinute: 100,
    keyRequestsPerMinute: 20,
    tokensPerMinute: 100_000,
    keyTokensPerMinute: 50_000,
    monthlyBudgetUsd: 100,
  },
  BUSINESS: {
    requestsPerMinute: 600,
    keyRequestsPerMinute: 120,
    tokensPerMinute: 1_000_000,
    keyTokensPerMinute: 250_000,
    monthlyBudgetUsd: 1_000,
  },
  ENTERPRISE: {
    requestsPerMinute: 6_000,
    keyRequestsPerMinute: 600,
    tokensPerMinute: 10_000_000,
    keyTokensPerMinute: 2_500_000,
    monthlyBudgetUsd: 10_000,
  },
};

/** Injection token for the plan table, so tests (and later, configuration) can replace it. */
export const PLAN_LIMITS = Symbol('PLAN_LIMITS');

/** The numbers that apply to one request, after the key's own override is taken into account. */
export interface ResolvedLimits {
  tenantRequests: number;
  keyRequests: number;
  tenantTokens: number;
  keyTokens: number;
  /** Micro-dollars (1 USD = 1,000,000), so budget arithmetic is exact integer math. */
  monthlyBudgetMicroUsd: number;
}

@Injectable()
export class TrafficLimits {
  constructor(@Inject(PLAN_LIMITS) private readonly table: Record<TenantPlan, PlanLimits>) {}

  forAuth(auth: Pick<ApiKeyAuth, 'plan' | 'rateLimit'>): ResolvedLimits {
    const plan = this.table[auth.plan];
    return {
      tenantRequests: plan.requestsPerMinute,
      keyRequests: auth.rateLimit ?? plan.keyRequestsPerMinute,
      tenantTokens: plan.tokensPerMinute,
      keyTokens: plan.keyTokensPerMinute,
      monthlyBudgetMicroUsd: Math.round(plan.monthlyBudgetUsd * 1_000_000),
    };
  }
}
