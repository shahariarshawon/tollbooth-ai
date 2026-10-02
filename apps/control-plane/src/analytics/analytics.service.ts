import { Injectable } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type {
  AnalyticsCost,
  AnalyticsModels,
  AnalyticsOverview,
  AnalyticsUsage,
  ModelUsageRow,
  NamedCount,
} from './analytics.types';

/** Start of the UTC day `days` ago, so "last 30 days" means whole days, not a sliding 720 hours. */
function since(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

const toNumber = (value: unknown): number => Number(value ?? 0);

interface DailySeriesRow {
  day: Date;
  requests: bigint;
  tokens: bigint;
}

interface DailyCostRow {
  day: Date;
  cost: string;
}

interface MonthlyCostRow {
  month: Date;
  cost: string;
}

/**
 * Reads what Phase 4-8 already write (`ai_requests`, `ledger_entries`); nothing here writes anything.
 * `ai_requests` is the source for operational analytics (overview, usage, per-model breakdown): it
 * already carries tokens, cost, provider, model, project and API key on one row, per request. For cost
 * specifically (`/analytics/cost`'s daily and monthly totals), `ledger_entries` is used instead: it is
 * the ledger Phase 7 built as the actual financial record (see docs/architecture/usage-cost-engine.md),
 * and its `AI_USAGE` rows carry the same figures as `estimatedCost`, just as signed accounting entries.
 * `usage_events` is in the schema (and listed as a data source for this phase) but nothing in the
 * codebase writes to it yet, so it is not queried: doing so would only ever return zero rows.
 *
 * Every query is scoped by `tenantId`, the same way every other service in this app is.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string, days: number, includeCost: boolean): Promise<AnalyticsOverview> {
    const from = since(days);
    const [aggregate, activeUsers, activeProjects] = await Promise.all([
      this.prisma.aiRequest.aggregate({
        where: { tenantId, createdAt: { gte: from } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCost: true },
      }),
      this.prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.project.count({ where: { tenantId, status: 'ACTIVE' } }),
    ]);

    return {
      periodDays: days,
      totalRequests: aggregate._count._all,
      totalTokens: toNumber(aggregate._sum.totalTokens),
      totalCost: includeCost ? toNumber(aggregate._sum.estimatedCost) : null,
      activeUsers,
      activeProjects,
    };
  }

  async usage(tenantId: string, days: number): Promise<AnalyticsUsage> {
    const from = since(days);

    const [series, providerGroups, projectGroups, apiKeyGroups] = await Promise.all([
      this.prisma.$queryRaw<DailySeriesRow[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               COUNT(*)::bigint AS requests,
               COALESCE(SUM("totalTokens"), 0)::bigint AS tokens
        FROM ai_requests
        WHERE "tenantId" = ${tenantId}::uuid AND "createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.aiRequest.groupBy({
        by: ['provider'],
        where: { tenantId, createdAt: { gte: from } },
        _count: { _all: true },
      }),
      this.prisma.aiRequest.groupBy({
        by: ['projectId'],
        where: { tenantId, createdAt: { gte: from } },
        _count: { _all: true },
        _sum: { totalTokens: true },
      }),
      this.prisma.aiRequest.groupBy({
        by: ['apiKeyId'],
        where: { tenantId, createdAt: { gte: from } },
        _count: { _all: true },
        _sum: { totalTokens: true },
      }),
    ]);

    const topProjectGroups = [...projectGroups]
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5);
    const topApiKeyGroups = [...apiKeyGroups]
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5);

    const projectIds = topProjectGroups.map((group) => group.projectId).filter(Boolean);
    const apiKeyIds = topApiKeyGroups.map((group) => group.apiKeyId).filter(Boolean);

    const [projects, apiKeys] = await Promise.all([
      projectIds.length > 0
        ? this.prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      apiKeyIds.length > 0
        ? this.prisma.apiKey.findMany({
            where: { id: { in: apiKeyIds } },
            select: { id: true, name: true, project: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);
    const projectName = new Map(projects.map((project) => [project.id, project.name]));
    const apiKeyInfo = new Map(apiKeys.map((key) => [key.id, key]));

    return {
      periodDays: days,
      requestsOverTime: series.map((row) => ({
        date: row.day.toISOString().slice(0, 10),
        requests: Number(row.requests),
      })),
      tokensOverTime: series.map((row) => ({
        date: row.day.toISOString().slice(0, 10),
        tokens: Number(row.tokens),
      })),
      providerUsage: providerGroups.map((group): NamedCount => ({
        label: group.provider,
        value: group._count._all,
      })),
      topProjects: topProjectGroups.map((group) => ({
        id: group.projectId,
        name: projectName.get(group.projectId) ?? 'Unknown project',
        requests: group._count._all,
        tokens: toNumber(group._sum.totalTokens),
      })),
      topApiKeys: topApiKeyGroups.map((group) => ({
        id: group.apiKeyId,
        name: apiKeyInfo.get(group.apiKeyId)?.name ?? 'Unknown key',
        projectName: apiKeyInfo.get(group.apiKeyId)?.project.name ?? 'Unknown project',
        requests: group._count._all,
        tokens: toNumber(group._sum.totalTokens),
      })),
    };
  }

  async models(tenantId: string, days: number, includeCost: boolean): Promise<AnalyticsModels> {
    const from = since(days);
    const groups = await this.prisma.aiRequest.groupBy({
      by: ['provider', 'model'],
      where: { tenantId, createdAt: { gte: from } },
      _count: { _all: true },
      _sum: { totalTokens: true, estimatedCost: true },
    });

    const models: ModelUsageRow[] = groups
      .map((group) => ({
        provider: group.provider,
        model: group.model,
        requests: group._count._all,
        tokens: toNumber(group._sum.totalTokens),
        cost: includeCost ? toNumber(group._sum.estimatedCost) : null,
      }))
      .sort((a, b) => b.requests - a.requests);

    return { periodDays: days, models };
  }

  async cost(tenantId: string, days: number): Promise<AnalyticsCost> {
    const from = since(days);

    const [dailyRows, monthlyRows, providerGroups] = await Promise.all([
      this.prisma.$queryRaw<DailyCostRow[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               COALESCE(SUM(-amount), 0)::text AS cost
        FROM ledger_entries
        WHERE "tenantId" = ${tenantId}::uuid
          AND "transactionType" = 'AI_USAGE'
          AND "createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1
      `,
      // Always the trailing 12 months, independent of `days`: a cost trend is naturally read over a
      // longer window than the daily chart next to it.
      this.prisma.$queryRaw<MonthlyCostRow[]>`
        SELECT date_trunc('month', "createdAt") AS month,
               COALESCE(SUM(-amount), 0)::text AS cost
        FROM ledger_entries
        WHERE "tenantId" = ${tenantId}::uuid
          AND "transactionType" = 'AI_USAGE'
          AND "createdAt" >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.aiRequest.groupBy({
        by: ['provider'],
        where: { tenantId, createdAt: { gte: from } },
        _sum: { estimatedCost: true },
      }),
    ]);

    return {
      periodDays: days,
      dailyCost: dailyRows.map((row) => ({
        date: row.day.toISOString().slice(0, 10),
        cost: Number(row.cost),
      })),
      monthlyCost: monthlyRows.map((row) => ({
        month: row.month.toISOString().slice(0, 7),
        cost: Number(row.cost),
      })),
      providerCostBreakdown: providerGroups.map((group): NamedCount => ({
        label: group.provider,
        value: toNumber(group._sum.estimatedCost),
      })),
    };
  }
}
