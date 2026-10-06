import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import type { Account, TestContext } from './support/context';
import {
  asTenant,
  bearer,
  createSuperAdmin,
  createTestContext,
  createUser,
  destroyTestContext,
  http,
  registerTenant,
  unique,
} from './support/context';

type Provider = 'GOOGLE' | 'OPENAI' | 'ANTHROPIC';

interface SeededRequest {
  provider: Provider;
  model: string;
  status?: 'SUCCESS' | 'FAILED';
  latencyMs: number | null;
  tokens: number;
  costUsd: string;
  minutesAgo?: number;
}

/**
 * GET /dashboard/overview: the dashboard's landing page, served from real data. Fixture rows are
 * inserted directly, the way the gateway writes them. The provider-health tests read and write the
 * circuit breaker key in Redis, so they need the same local Redis as the gateway's tests.
 */
describe('Dashboard overview (e2e)', () => {
  let ctx: TestContext;
  let redis: Redis;
  let tenantA: Account & { tenantId: string };
  let tenantB: Account & { tenantId: string };
  let developerA: Account;
  let financeA: Account;
  const tenantAOnlyRequestIds: string[] = [];
  const projectIds: string[] = [];
  const apiKeyIds: string[] = [];
  const providerIds: string[] = [];
  const circuitKeys: string[] = [];

  async function seedProjectAndKey(tenantId: string, label: string) {
    const project = await ctx.prisma.project.create({
      data: { tenantId, name: `${label} project` },
    });
    const apiKey = await ctx.prisma.apiKey.create({
      data: {
        tenantId,
        projectId: project.id,
        keyHash: randomUUID(),
        keyPrefix: 'tb_test',
        name: `${label} key`,
      },
    });
    projectIds.push(project.id);
    apiKeyIds.push(apiKey.id);
    return { projectId: project.id, apiKeyId: apiKey.id };
  }

  async function seedRequest(
    tenantId: string,
    target: { projectId: string; apiKeyId: string },
    row: SeededRequest,
  ): Promise<string> {
    const request = await ctx.prisma.aiRequest.create({
      data: {
        tenantId,
        projectId: target.projectId,
        apiKeyId: target.apiKeyId,
        provider: row.provider,
        model: row.model,
        totalTokens: row.tokens,
        requestTokens: Math.round(row.tokens * 0.7),
        responseTokens: Math.round(row.tokens * 0.3),
        latencyMs: row.latencyMs,
        estimatedCost: row.costUsd,
        status: row.status ?? 'SUCCESS',
        createdAt: new Date(Date.now() - (row.minutesAgo ?? 1) * 60_000),
      },
    });
    await ctx.prisma.ledgerEntry.create({
      data: {
        tenantId,
        requestId: request.id,
        transactionType: 'AI_USAGE',
        amount: `-${row.costUsd}`,
      },
    });
    return request.id;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    redis = ctx.app.get<Redis>(REDIS_CLIENT);
    tenantA = await registerTenant(ctx, 'dash-a');
    tenantB = await registerTenant(ctx, 'dash-b');
    developerA = await createUser(ctx, tenantA, 'DEVELOPER');
    financeA = await createUser(ctx, tenantA, 'FINANCE');

    const a = await seedProjectAndKey(tenantA.tenantId, 'A');
    const b = await seedProjectAndKey(tenantB.tenantId, 'B');

    // Tenant A: five requests, latencies 100/200/300/400/1000 ms, one failure. Total $0.15, 500 tokens.
    const rows: SeededRequest[] = [
      {
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
        latencyMs: 100,
        tokens: 100,
        costUsd: '0.01',
        minutesAgo: 50,
      },
      {
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
        latencyMs: 200,
        tokens: 100,
        costUsd: '0.02',
        minutesAgo: 40,
      },
      {
        provider: 'GOOGLE',
        model: 'gemini-2.5-pro',
        latencyMs: 300,
        tokens: 100,
        costUsd: '0.03',
        minutesAgo: 30,
      },
      {
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        latencyMs: 400,
        tokens: 100,
        costUsd: '0.04',
        minutesAgo: 20,
      },
      {
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        status: 'FAILED',
        latencyMs: 1000,
        tokens: 100,
        costUsd: '0.05',
        minutesAgo: 10,
      },
    ];
    for (const row of rows) tenantAOnlyRequestIds.push(await seedRequest(tenantA.tenantId, a, row));

    // Tenant B's traffic must never show up for tenant A.
    await seedRequest(tenantB.tenantId, b, {
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-4-5',
      latencyMs: 9999,
      tokens: 777,
      costUsd: '9.99',
    });

    await ctx.prisma.alert.createMany({
      data: [
        {
          tenantId: tenantA.tenantId,
          type: 'SECURITY_ALERT',
          severity: 'CRITICAL',
          message: 'PII detected',
        },
        {
          tenantId: tenantA.tenantId,
          type: 'BUDGET_LIMIT',
          severity: 'WARNING',
          message: 'Budget at 80%',
        },
        {
          tenantId: tenantA.tenantId,
          type: 'PROVIDER_ERROR',
          severity: 'WARNING',
          message: 'Provider hiccup',
        },
        {
          tenantId: tenantB.tenantId,
          type: 'SECURITY_ALERT',
          severity: 'CRITICAL',
          message: 'Other tenant alert',
        },
      ],
    });
  });

  afterAll(async () => {
    if (!ctx) return;
    const tenantIds = [tenantA?.tenantId, tenantB?.tenantId].filter((id): id is string => !!id);
    if (circuitKeys.length > 0) await redis.del(...circuitKeys);
    await ctx.prisma.aiProvider.deleteMany({ where: { id: { in: providerIds } } });
    await ctx.prisma.ledgerEntry.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await ctx.prisma.aiRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await ctx.prisma.alert.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await ctx.prisma.apiKey.deleteMany({ where: { id: { in: apiKeyIds } } });
    await ctx.prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await destroyTestContext(ctx);
  });

  describe('access control', () => {
    it('rejects an unauthenticated request', async () => {
      await http(ctx).get('/dashboard/overview').expect(401);
    });

    it('refuses a SUPER_ADMIN who has not chosen a tenant, and serves the chosen one', async () => {
      const superAdmin = await createSuperAdmin(ctx);
      await http(ctx).get('/dashboard/overview').set(bearer(superAdmin)).expect(403);

      const res = await http(ctx)
        .get('/dashboard/overview')
        .set(bearer(superAdmin))
        .set(asTenant(tenantA.tenantId))
        .expect(200);
      expect(res.body.stats.requests).toBe(5);
    });

    it('never lets a tenant user address another tenant, even by header', async () => {
      await http(ctx)
        .get('/dashboard/overview')
        .set(bearer(tenantA))
        .set(asTenant(tenantB.tenantId))
        .expect(403);
    });

    it('validates the period', async () => {
      await http(ctx).get('/dashboard/overview?days=0').set(bearer(tenantA)).expect(400);
      await http(ctx).get('/dashboard/overview?days=400').set(bearer(tenantA)).expect(400);
      await http(ctx).get('/dashboard/overview?days=abc').set(bearer(tenantA)).expect(400);
    });
  });

  describe('data and tenant isolation', () => {
    it('computes the headline numbers from this tenant only', async () => {
      const res = await http(ctx).get('/dashboard/overview').set(bearer(tenantA)).expect(200);
      expect(res.body.periodDays).toBe(30);
      expect(res.body.stats).toEqual({
        requests: 5,
        tokens: 500,
        cost: 0.15,
        errorRate: 0.2,
        // percentile_cont(0.95) over 100, 200, 300, 400, 1000 interpolates to 880.
        p95LatencyMs: 880,
        activeProjects: 1,
        activeApiKeys: 1,
      });
    });

    it('breaks usage down by model and provider, without the other tenant', async () => {
      const res = await http(ctx).get('/dashboard/overview').set(bearer(tenantA)).expect(200);
      expect(res.body.modelUsage).toEqual([
        { label: 'gemini-2.0-flash', value: 2 },
        { label: 'gpt-4o-mini', value: 2 },
        { label: 'gemini-2.5-pro', value: 1 },
      ]);
      const providers = Object.fromEntries(
        res.body.providerUsage.map((row: { label: string; value: number }) => [
          row.label,
          row.value,
        ]),
      );
      expect(providers).toEqual({ GOOGLE: 3, OPENAI: 2 });
      expect(JSON.stringify(res.body)).not.toContain('claude-sonnet-4-5');
    });

    it('returns one zero-filled point per day, with today holding the traffic', async () => {
      const res = await http(ctx)
        .get('/dashboard/overview?days=7')
        .set(bearer(tenantA))
        .expect(200);
      expect(res.body.requestVolume).toHaveLength(7);
      expect(res.body.costTrend).toHaveLength(7);
      const today = new Date().toISOString().slice(0, 10);
      const last = res.body.requestVolume.at(-1);
      expect(last.date).toBe(today);
      // Requests were created up to 50 minutes ago, so a run just after midnight UTC may split them.
      const total = res.body.requestVolume.reduce(
        (sum: number, point: { requests: number }) => sum + point.requests,
        0,
      );
      expect(total).toBe(5);
      expect(res.body.requestVolume[0].requests).toBe(0);
    });

    it("lists only this tenant's most recent requests, newest first, with project and key names", async () => {
      const res = await http(ctx).get('/dashboard/overview').set(bearer(tenantA)).expect(200);
      const ids = res.body.recentRequests.map((row: { id: string }) => row.id);
      expect(ids).toEqual([...tenantAOnlyRequestIds].reverse());
      expect(res.body.recentRequests[0]).toMatchObject({
        status: 'FAILED',
        projectName: 'A project',
        apiKeyName: 'A key',
        latencyMs: 1000,
      });
    });

    it("lists this tenant's security and budget alerts only, not other alert types or other tenants'", async () => {
      const res = await http(ctx).get('/dashboard/overview').set(bearer(tenantA)).expect(200);
      const messages = res.body.policyEvents.map((row: { message: string }) => row.message).sort();
      expect(messages).toEqual(['Budget at 80%', 'PII detected']);
    });

    it("shows tenant B its own single request and nothing of tenant A's", async () => {
      const res = await http(ctx).get('/dashboard/overview').set(bearer(tenantB)).expect(200);
      expect(res.body.stats.requests).toBe(1);
      expect(res.body.stats.cost).toBe(9.99);
      expect(JSON.stringify(res.body)).not.toContain('gemini-2.0-flash');
    });

    it('reports an empty tenant as zeros, not errors', async () => {
      const fresh = await registerTenant(ctx, 'dash-empty');
      const res = await http(ctx).get('/dashboard/overview').set(bearer(fresh)).expect(200);
      expect(res.body.stats).toMatchObject({
        requests: 0,
        tokens: 0,
        errorRate: 0,
        p95LatencyMs: null,
        activeProjects: 0,
        activeApiKeys: 0,
      });
      expect(res.body.recentRequests).toEqual([]);
      expect(res.body.modelUsage).toEqual([]);
    });
  });

  describe('budget and cost visibility (VIEW_BILLING)', () => {
    it('shows cost and the monthly budget to TENANT_ADMIN and FINANCE', async () => {
      for (const account of [tenantA, financeA]) {
        const res = await http(ctx).get('/dashboard/overview').set(bearer(account)).expect(200);
        expect(res.body.stats.cost).toBe(0.15);
        expect(res.body.costTrend).not.toBeNull();
        // No subscription for a freshly registered tenant, so the platform default (100 USD) applies.
        expect(res.body.budget).toMatchObject({ limitUsd: 100, spentUsd: 0.15 });
        expect(res.body.budget.utilization).toBeCloseTo(0.0015, 6);
        expect(res.body.recentRequests[0].cost).toBe(0.05);
      }
    });

    it('hides every money figure from a DEVELOPER but keeps the operational ones', async () => {
      const res = await http(ctx).get('/dashboard/overview').set(bearer(developerA)).expect(200);
      expect(res.body.stats.cost).toBeNull();
      expect(res.body.costTrend).toBeNull();
      expect(res.body.budget).toBeNull();
      expect(res.body.recentRequests.every((row: { cost: unknown }) => row.cost === null)).toBe(
        true,
      );
      expect(res.body.stats.requests).toBe(5);
      expect(res.body.stats.p95LatencyMs).toBe(880);
    });

    it('uses the tenant subscription limit when there is one', async () => {
      const plan = await ctx.prisma.billingPlan.upsert({
        where: { code: 'E2E_DASH' },
        update: {},
        create: { code: 'E2E_DASH', name: 'E2E', monthlyBudgetLimit: '50' },
      });
      await ctx.prisma.tenantSubscription.create({
        data: {
          tenantId: tenantA.tenantId,
          planId: plan.id,
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
          monthlyBudgetLimit: '20',
        },
      });
      try {
        const res = await http(ctx).get('/dashboard/overview').set(bearer(tenantA)).expect(200);
        expect(res.body.budget.limitUsd).toBe(20);
        expect(res.body.budget.utilization).toBeCloseTo(0.0075, 6);
      } finally {
        await ctx.prisma.tenantSubscription.delete({ where: { tenantId: tenantA.tenantId } });
        await ctx.prisma.billingPlan.delete({ where: { id: plan.id } });
      }
    });
  });

  describe('provider health', () => {
    it("combines the provider's status, the gateway's circuit state and this tenant's recent calls", async () => {
      const name = unique('e2e-anthropic');
      const provider = await ctx.prisma.aiProvider.create({
        data: { name, type: 'ANTHROPIC', status: 'ACTIVE' },
      });
      providerIds.push(provider.id);
      const key = 'provider:anthropic:circuit';
      circuitKeys.push(key);

      const find = async () => {
        const res = await http(ctx).get('/dashboard/overview').set(bearer(tenantA)).expect(200);
        return res.body.providers.find((row: { name: string }) => row.name === name);
      };

      await redis.del(key);
      expect(await find()).toMatchObject({
        id: 'anthropic',
        enabled: true,
        circuit: 'CLOSED',
        health: 'IDLE',
        recentRequests: 0,
      });

      await redis.set(
        key,
        JSON.stringify({ state: 'OPEN', failureCount: 5, openedAt: Date.now() }),
      );
      expect(await find()).toMatchObject({ circuit: 'OPEN', health: 'DOWN' });

      await redis.set(key, JSON.stringify({ state: 'HALF_OPEN', failureCount: 5 }));
      expect(await find()).toMatchObject({ circuit: 'HALF_OPEN', health: 'DEGRADED' });

      await ctx.prisma.aiProvider.update({
        where: { id: provider.id },
        data: { status: 'DISABLED' },
      });
      expect(await find()).toMatchObject({ enabled: false, health: 'DISABLED' });
    });

    it("counts this tenant's last-hour calls per provider", async () => {
      const name = unique('e2e-openai');
      const provider = await ctx.prisma.aiProvider.create({
        data: { name, type: 'OPENAI', status: 'ACTIVE' },
      });
      providerIds.push(provider.id);
      circuitKeys.push('provider:openai:circuit');
      await redis.del('provider:openai:circuit');

      const res = await http(ctx).get('/dashboard/overview').set(bearer(tenantA)).expect(200);
      const row = res.body.providers.find((p: { name: string }) => p.name === name);
      // Tenant A made 2 OpenAI requests in the last hour, 1 failed. Too few to call it degraded.
      expect(row).toMatchObject({ recentRequests: 2, recentFailures: 1, health: 'HEALTHY' });
    });
  });
});
