import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import { circuitKey, parseCircuitSnapshot, PROVIDER_ID_BY_TYPE } from '@tollbooth/shared';
import type {
  CircuitState,
  DashboardOverview,
  PolicyEventRow,
  ProviderStatusRow,
  RecentRequestRow,
} from '@tollbooth/shared';
import type Redis from 'ioredis';
import { BillingService } from '../billing/billing.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { classifyProviderHealth } from './provider-health';

const RECENT_REQUESTS = 10;
const POLICY_EVENTS = 5;
const TOP_MODELS = 8;
/** Provider health looks at the last hour: recent enough to mean "now", long enough to hold a sample. */
const PROVIDER_WINDOW_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC at the start of the oldest day of a `days`-day period that ends today. */
export function periodStart(days: number, now: Date = new Date()): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
}

const toNumber = (value: unknown): number => Number(value ?? 0);

interface StatsRow {
  requests: bigint;
  tokens: bigint;
  cost: string;
  failed: bigint;
  p95: number | null;
}

interface DayRow {
  day: Date;
  requests: bigint;
  failed: bigint;
  cost: string;
}

/**
 * The dashboard's landing page, assembled with a fixed number of queries however much data the tenant
 * has: aggregates are computed by the database, never per row in a loop. Every query is scoped by
 * `tenantId`. The only data that is not tenant-owned is the provider catalogue and the circuit breaker
 * state, which describe the platform's providers rather than anyone's usage.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async overview(tenantId: string, days: number, includeCost: boolean): Promise<DashboardOverview> {
    const now = new Date();
    const from = periodStart(days, now);
    const providerSince = new Date(now.getTime() - PROVIDER_WINDOW_MS);

    const [
      stats,
      dailyRows,
      modelGroups,
      providerGroups,
      recentByProvider,
      providers,
      activeProjects,
      activeApiKeys,
      budget,
      recent,
      events,
    ] = await Promise.all([
      this.prisma.$queryRaw<StatsRow[]>`
        SELECT COUNT(*)::bigint AS requests,
               COALESCE(SUM("totalTokens"), 0)::bigint AS tokens,
               COALESCE(SUM("estimatedCost"), 0)::text AS cost,
               COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")
                 FILTER (WHERE "latencyMs" IS NOT NULL) AS p95
        FROM ai_requests
        WHERE "tenantId" = ${tenantId}::uuid AND "createdAt" >= ${from}
      `,
      this.prisma.$queryRaw<DayRow[]>`
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day,
               COUNT(*)::bigint AS requests,
               COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed,
               COALESCE(SUM("estimatedCost"), 0)::text AS cost
        FROM ai_requests
        WHERE "tenantId" = ${tenantId}::uuid AND "createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.aiRequest.groupBy({
        by: ['model'],
        where: { tenantId, createdAt: { gte: from } },
        _count: { _all: true },
        // The model name breaks ties, so equal counts always come back in the same order.
        orderBy: [{ _count: { model: 'desc' } }, { model: 'asc' }],
        take: TOP_MODELS,
      }),
      this.prisma.aiRequest.groupBy({
        by: ['provider'],
        where: { tenantId, createdAt: { gte: from } },
        _count: { _all: true },
      }),
      this.prisma.aiRequest.groupBy({
        by: ['provider', 'status'],
        where: { tenantId, createdAt: { gte: providerSince } },
        _count: { _all: true },
      }),
      this.prisma.aiProvider.findMany({
        select: { name: true, type: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.project.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.apiKey.count({
        where: {
          tenantId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      includeCost ? this.billing.getMonthlyBudget(tenantId) : Promise.resolve(null),
      this.prisma.aiRequest.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_REQUESTS,
        select: {
          id: true,
          createdAt: true,
          provider: true,
          model: true,
          status: true,
          latencyMs: true,
          totalTokens: true,
          estimatedCost: true,
          project: { select: { name: true } },
          apiKey: { select: { name: true } },
        },
      }),
      this.prisma.alert.findMany({
        where: { tenantId, type: { in: ['SECURITY_ALERT', 'BUDGET_LIMIT'] } },
        orderBy: { createdAt: 'desc' },
        take: POLICY_EVENTS,
        select: { id: true, type: true, severity: true, message: true, createdAt: true },
      }),
    ]);

    const total = stats[0];
    const requests = toNumber(total?.requests);
    const dayPoints = this.fillDays(from, days, dailyRows);

    return {
      periodDays: days,
      generatedAt: now.toISOString(),
      stats: {
        requests,
        tokens: toNumber(total?.tokens),
        cost: includeCost ? toNumber(total?.cost) : null,
        errorRate: requests > 0 ? toNumber(total?.failed) / requests : 0,
        p95LatencyMs:
          total?.p95 === null || total?.p95 === undefined ? null : Math.round(total.p95),
        activeProjects,
        activeApiKeys,
      },
      requestVolume: dayPoints.map(({ date, requests: count, failures }) => ({
        date,
        requests: count,
        failures,
      })),
      costTrend: includeCost ? dayPoints.map(({ date, cost }) => ({ date, cost })) : null,
      modelUsage: modelGroups.map((group) => ({ label: group.model, value: group._count._all })),
      providerUsage: providerGroups
        .map((group) => ({ label: group.provider, value: group._count._all }))
        .sort((a, b) => b.value - a.value),
      providers: await this.providerStatuses(providers, recentByProvider),
      budget: budget
        ? {
            limitUsd: budget.limitUsd,
            spentUsd: budget.spentUsd,
            utilization: budget.limitUsd > 0 ? budget.spentUsd / budget.limitUsd : 0,
          }
        : null,
      recentRequests: recent.map((row): RecentRequestRow => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        provider: row.provider,
        model: row.model,
        status: row.status,
        latencyMs: row.latencyMs,
        totalTokens: row.totalTokens,
        cost: includeCost ? toNumber(row.estimatedCost) : null,
        projectName: row.project.name,
        apiKeyName: row.apiKey.name,
      })),
      policyEvents: events.map((row): PolicyEventRow => ({
        id: row.id,
        type: row.type as PolicyEventRow['type'],
        severity: row.severity,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** One point per day, so a quiet day shows as zero instead of being missing from the chart. */
  private fillDays(from: Date, days: number, rows: DayRow[]) {
    const byDate = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), row]));
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(from.getTime() + index * DAY_MS).toISOString().slice(0, 10);
      const row = byDate.get(date);
      return {
        date,
        requests: toNumber(row?.requests),
        failures: toNumber(row?.failed),
        cost: toNumber(row?.cost),
      };
    });
  }

  private async providerStatuses(
    providers: { name: string; type: keyof typeof PROVIDER_ID_BY_TYPE; status: string }[],
    recent: { provider: string; status: string; _count: { _all: number } }[],
  ): Promise<ProviderStatusRow[]> {
    const circuits = await this.readCircuits(providers.map((p) => PROVIDER_ID_BY_TYPE[p.type]));

    return providers.map((provider) => {
      const id = PROVIDER_ID_BY_TYPE[provider.type];
      const rows = recent.filter((row) => row.provider === provider.type);
      const recentRequests = rows.reduce((sum, row) => sum + row._count._all, 0);
      const recentFailures = rows
        .filter((row) => row.status === 'FAILED')
        .reduce((sum, row) => sum + row._count._all, 0);
      const enabled = provider.status === 'ACTIVE';
      const circuit = circuits.get(id) ?? null;
      return {
        id,
        name: provider.name,
        enabled,
        circuit,
        health: classifyProviderHealth({ enabled, circuit, recentRequests, recentFailures }),
        recentRequests,
        recentFailures,
      };
    });
  }

  /** Circuit state per provider in one round trip. Unknown (null) when Redis cannot be read. */
  private async readCircuits(ids: string[]): Promise<Map<string, CircuitState | null>> {
    if (ids.length === 0) return new Map();
    try {
      const raw = await this.redis.mget(ids.map(circuitKey));
      return new Map(ids.map((id, index) => [id, parseCircuitSnapshot(raw[index] ?? null).state]));
    } catch (error) {
      this.logger.warn(
        `Could not read provider circuit state: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Map(ids.map((id) => [id, null]));
    }
  }
}
