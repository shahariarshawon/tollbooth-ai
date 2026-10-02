import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantPlan } from '@tollbooth/database';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type {
  AssignSubscriptionDto,
  CreateBillingPlanDto,
  UpdateBillingLimitsDto,
} from './dto/billing.dto';

export interface ProviderCostSummary {
  provider: string;
  requests: number;
  tokens: number;
  cost: number;
  percentage: number;
}

export interface BillingSummary {
  currentPlan: {
    name: string;
    code: string;
    monthlyPrice: number;
    description: string | null;
    features: string[];
    status: string;
  };
  monthlyLimit: number;
  currentUsage: number;
  remainingBudget: number;
  estimatedCost: number;
  totalTokens: number;
  providerBreakdown: ProviderCostSummary[];
}

export interface BillingHistoryItem {
  id: string;
  transactionType: string;
  amount: number;
  currency: string;
  description: string | null;
  createdAt: Date;
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getSummary(tenantId: string): Promise<BillingSummary> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    const fromDate = startOfCurrentMonth();

    // Calculate usage from ledgerEntries and aiRequests
    const [ledgerSum, requestsSum, providerGroups] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: {
          tenantId,
          transactionType: 'AI_USAGE',
          createdAt: { gte: fromDate },
        },
        _sum: { amount: true },
      }),
      this.prisma.aiRequest.aggregate({
        where: { tenantId, createdAt: { gte: fromDate } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCost: true },
      }),
      this.prisma.aiRequest.groupBy({
        by: ['provider'],
        where: { tenantId, createdAt: { gte: fromDate } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCost: true },
      }),
    ]);

    // Plan fallback
    const subscription = tenant.subscription;
    const plan = subscription?.plan;

    const monthlyLimit = Number(
      subscription?.monthlyBudgetLimit ?? plan?.monthlyBudgetLimit ?? 100,
    );

    // Ledger amounts for AI_USAGE are recorded as negative values (charges), so take absolute
    const ledgerSpend = Math.abs(Number(ledgerSum._sum.amount ?? 0));
    const requestSpend = Number(requestsSum._sum.estimatedCost ?? 0);
    const currentUsage = Math.max(ledgerSpend, requestSpend);

    const remainingBudget = Math.max(0, monthlyLimit - currentUsage);
    const totalTokens = Number(requestsSum._sum.totalTokens ?? 0);

    // Cost projection based on elapsed days in current month
    const now = new Date();
    const dayOfMonth = now.getUTCDate();
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const projectedSpend = dayOfMonth > 0 ? (currentUsage / dayOfMonth) * daysInMonth : currentUsage;

    const providerBreakdown: ProviderCostSummary[] = providerGroups.map((group) => {
      const cost = Number(group._sum.estimatedCost ?? 0);
      return {
        provider: group.provider,
        requests: group._count._all,
        tokens: Number(group._sum.totalTokens ?? 0),
        cost,
        percentage: currentUsage > 0 ? Math.round((cost / currentUsage) * 100) : 0,
      };
    });

    return {
      currentPlan: {
        name: plan?.name ?? `${tenant.plan} Plan`,
        code: plan?.code ?? tenant.plan,
        monthlyPrice: Number(plan?.monthlyPrice ?? 0),
        description: plan?.description ?? null,
        features: plan?.features ?? ['Standard AI Gateway', 'Rate Limiting', 'Telemetry'],
        status: subscription?.status ?? 'ACTIVE',
      },
      monthlyLimit,
      currentUsage,
      remainingBudget,
      estimatedCost: Number(projectedSpend.toFixed(2)),
      totalTokens,
      providerBreakdown,
    };
  }

  async getHistory(tenantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, rawEntries] = await Promise.all([
      this.prisma.ledgerEntry.count({ where: { tenantId } }),
      this.prisma.ledgerEntry.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const items: BillingHistoryItem[] = rawEntries.map((e) => ({
      id: e.id,
      transactionType: e.transactionType,
      amount: Math.abs(Number(e.amount)),
      currency: e.currency,
      description: e.description,
      createdAt: e.createdAt,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async listPlans() {
    return this.prisma.billingPlan.findMany({
      where: { isActive: true },
      orderBy: { monthlyPrice: 'asc' },
    });
  }

  async createPlan(dto: CreateBillingPlanDto, actorUserId?: string) {
    const existing = await this.prisma.billingPlan.findUnique({ where: { code: dto.code } });
    if (existing) throw new BadRequestException(`Plan code "${dto.code}" already exists`);

    const plan = await this.prisma.billingPlan.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice,
        monthlyBudgetLimit: dto.monthlyBudgetLimit,
        dailyBudgetLimit: dto.dailyBudgetLimit,
        requestsPerMinute: dto.requestsPerMinute ?? 60,
        requestsPerDay: dto.requestsPerDay ?? 10000,
        tokensPerMinute: dto.tokensPerMinute ?? 100000,
        tokensPerDay: dto.tokensPerDay ?? 5000000,
        features: dto.features ?? [],
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.record({
      action: AuditAction.SETTINGS_CHANGED,
      resource: 'billing_plan',
      resourceId: plan.id,
      userId: actorUserId,
      metadata: { planCode: plan.code, name: plan.name },
    });

    return plan;
  }

  async assignSubscription(
    tenantId: string,
    dto: AssignSubscriptionDto,
    actorUserId?: string,
  ) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code: dto.planCode } });
    if (!plan) throw new NotFoundException(`Plan ${dto.planCode} not found`);

    const end = new Date();
    end.setMonth(end.getMonth() + 1);

    // Map planCode to TenantPlan enum if applicable
    const validPlanEnums = Object.values(TenantPlan);
    const matchedEnum = validPlanEnums.find((p) => p === dto.planCode) ?? TenantPlan.STARTUP;

    const [subscription] = await this.prisma.$transaction([
      this.prisma.tenantSubscription.upsert({
        where: { tenantId },
        update: {
          planId: plan.id,
          monthlyBudgetLimit: dto.monthlyBudgetLimit ?? plan.monthlyBudgetLimit,
          dailyBudgetLimit: dto.dailyBudgetLimit ?? plan.dailyBudgetLimit,
          currentPeriodEnd: end,
          status: 'ACTIVE',
        },
        create: {
          tenantId,
          planId: plan.id,
          monthlyBudgetLimit: dto.monthlyBudgetLimit ?? plan.monthlyBudgetLimit,
          dailyBudgetLimit: dto.dailyBudgetLimit ?? plan.dailyBudgetLimit,
          currentPeriodStart: new Date(),
          currentPeriodEnd: end,
          status: 'ACTIVE',
        },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: matchedEnum },
      }),
    ]);

    await this.audit.record({
      action: AuditAction.BUDGET_CHANGED,
      resource: 'subscription',
      resourceId: subscription.id,
      tenantId,
      userId: actorUserId,
      metadata: { planCode: plan.code, monthlyLimit: subscription.monthlyBudgetLimit },
    });

    return subscription;
  }

  async updateLimits(tenantId: string, dto: UpdateBillingLimitsDto, actorUserId?: string) {
    const subscription = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      throw new NotFoundException('No active subscription found for tenant. Assign a plan first.');
    }

    const updated = await this.prisma.tenantSubscription.update({
      where: { tenantId },
      data: {
        ...(dto.monthlyBudgetLimit !== undefined && { monthlyBudgetLimit: dto.monthlyBudgetLimit }),
        ...(dto.dailyBudgetLimit !== undefined && { dailyBudgetLimit: dto.dailyBudgetLimit }),
      },
    });

    await this.audit.record({
      action: AuditAction.BUDGET_CHANGED,
      resource: 'subscription_limits',
      resourceId: updated.id,
      tenantId,
      userId: actorUserId,
      metadata: {
        monthlyLimit: updated.monthlyBudgetLimit,
        dailyLimit: updated.dailyBudgetLimit,
      },
    });

    return updated;
  }
}
