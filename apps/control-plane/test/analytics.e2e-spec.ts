import { randomUUID } from 'node:crypto';
import type { Account, TestContext } from './support/context';
import {
  bearer,
  createTestContext,
  createUser,
  destroyTestContext,
  http,
  registerTenant,
} from './support/context';

/**
 * Phase 10: analytics endpoints read `ai_requests` and `ledger_entries`, which nothing in the control
 * plane writes (the gateway does). There is no `/projects` or `/api-keys` endpoint here yet either (see
 * README's roadmap), so the fixture rows below are inserted directly with Prisma, the same way the
 * gateway's own test fixtures are built.
 */
describe('Analytics (e2e)', () => {
  let ctx: TestContext;
  let tenantA: Account & { tenantId: string };
  let tenantB: Account & { tenantId: string };
  let financeA: Account;
  let developerA: Account;
  let projectAId: string;
  let apiKeyAId: string;
  const projectIds: string[] = [];
  const apiKeyIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestContext();
    tenantA = await registerTenant(ctx, 'analytics-a');
    tenantB = await registerTenant(ctx, 'analytics-b');
    financeA = await createUser(ctx, tenantA, 'FINANCE');
    developerA = await createUser(ctx, tenantA, 'DEVELOPER');

    const project = await ctx.prisma.project.create({
      data: { tenantId: tenantA.tenantId, name: 'Analytics project' },
    });
    projectAId = project.id;
    projectIds.push(project.id);

    const apiKey = await ctx.prisma.apiKey.create({
      data: {
        tenantId: tenantA.tenantId,
        projectId: project.id,
        keyHash: randomUUID(),
        keyPrefix: 'tb_test',
        name: 'Analytics key',
      },
    });
    apiKeyAId = apiKey.id;
    apiKeyIds.push(apiKey.id);

    // Tenant B gets its own project/key/request, used only to prove isolation.
    const projectB = await ctx.prisma.project.create({
      data: { tenantId: tenantB.tenantId, name: 'Other tenant project' },
    });
    projectIds.push(projectB.id);
    const apiKeyB = await ctx.prisma.apiKey.create({
      data: {
        tenantId: tenantB.tenantId,
        projectId: projectB.id,
        keyHash: randomUUID(),
        keyPrefix: 'tb_test',
        name: 'Other tenant key',
      },
    });
    apiKeyIds.push(apiKeyB.id);
    await seedRequest(ctx, {
      tenantId: tenantB.tenantId,
      projectId: projectB.id,
      apiKeyId: apiKeyB.id,
      provider: 'OPENAI',
      model: 'gpt-4o',
      tokens: 1000,
      costUsd: '9.99',
    });

    // Tenant A's real fixture: two Gemini requests and one OpenAI request, each with its ledger entry.
    await seedRequest(ctx, {
      tenantId: tenantA.tenantId,
      projectId: projectAId,
      apiKeyId: apiKeyAId,
      provider: 'GOOGLE',
      model: 'gemini-2.0-flash',
      tokens: 100,
      costUsd: '0.01',
    });
    await seedRequest(ctx, {
      tenantId: tenantA.tenantId,
      projectId: projectAId,
      apiKeyId: apiKeyAId,
      provider: 'GOOGLE',
      model: 'gemini-2.0-flash',
      tokens: 150,
      costUsd: '0.02',
    });
    await seedRequest(ctx, {
      tenantId: tenantA.tenantId,
      projectId: projectAId,
      apiKeyId: apiKeyAId,
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      tokens: 50,
      costUsd: '0.03',
    });
  });

  afterAll(async () => {
    if (!ctx) return;
    const tenantIds = [tenantA?.tenantId, tenantB?.tenantId].filter((id): id is string => !!id);
    // ai_requests and ledger_entries RESTRICT the tenant foreign key, so they must go before
    // destroyTestContext deletes the tenants themselves.
    await ctx.prisma.ledgerEntry.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await ctx.prisma.aiRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await ctx.prisma.apiKey.deleteMany({ where: { id: { in: apiKeyIds } } });
    await ctx.prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await destroyTestContext(ctx);
  });

  describe('data and tenant isolation', () => {
    it('overview only counts this tenant: 3 requests, 300 tokens, $0.06', async () => {
      const res = await http(ctx).get('/analytics/overview').set(bearer(tenantA)).expect(200);

      expect(res.body).toMatchObject({
        totalRequests: 3,
        totalTokens: 300,
        totalCost: 0.06,
        activeUsers: expect.any(Number),
        activeProjects: 1,
      });
    });

    it('usage breaks down by provider and names the top project and key, scoped to this tenant', async () => {
      const res = await http(ctx).get('/analytics/usage').set(bearer(tenantA)).expect(200);

      const providers = Object.fromEntries(
        res.body.providerUsage.map((row: { label: string; value: number }) => [
          row.label,
          row.value,
        ]),
      );
      expect(providers).toEqual({ GOOGLE: 2, OPENAI: 1 });
      expect(res.body.topProjects).toEqual([
        { id: projectAId, name: 'Analytics project', requests: 3, tokens: 300 },
      ]);
      expect(res.body.topApiKeys[0]).toMatchObject({
        id: apiKeyAId,
        name: 'Analytics key',
        requests: 3,
      });
    });

    it('models lists each model with its own totals', async () => {
      const res = await http(ctx).get('/analytics/models').set(bearer(tenantA)).expect(200);

      expect(res.body.models).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: 'GOOGLE', model: 'gemini-2.0-flash', requests: 2 }),
          expect.objectContaining({ provider: 'OPENAI', model: 'gpt-4o-mini', requests: 1 }),
        ]),
      );
      // Tenant B's gpt-4o must never appear in tenant A's response.
      expect(res.body.models.some((m: { model: string }) => m.model === 'gpt-4o')).toBe(false);
    });

    it('cost totals reflect only this tenant (0.06), never the other tenant (9.99)', async () => {
      const res = await http(ctx).get('/analytics/cost').set(bearer(tenantA)).expect(200);

      const totalDaily = res.body.dailyCost.reduce(
        (sum: number, day: { cost: number }) => sum + day.cost,
        0,
      );
      expect(totalDaily).toBeCloseTo(0.06, 6);
      const providerCost = Object.fromEntries(
        res.body.providerCostBreakdown.map((row: { label: string; value: number }) => [
          row.label,
          row.value,
        ]),
      );
      expect(providerCost.OPENAI).toBeCloseTo(0.03, 6);
      expect(providerCost).not.toHaveProperty('9.99');
    });

    it('tenant B sees only its own single request', async () => {
      const res = await http(ctx).get('/analytics/overview').set(bearer(tenantB)).expect(200);
      expect(res.body).toMatchObject({ totalRequests: 1, totalTokens: 1000 });
    });
  });

  describe('access control (Task 5)', () => {
    it('DEVELOPER sees usage and models, with cost hidden (null)', async () => {
      const overview = await http(ctx)
        .get('/analytics/overview')
        .set(bearer(developerA))
        .expect(200);
      expect(overview.body.totalCost).toBeNull();

      const models = await http(ctx).get('/analytics/models').set(bearer(developerA)).expect(200);
      expect(models.body.models.every((m: { cost: unknown }) => m.cost === null)).toBe(true);

      await http(ctx).get('/analytics/usage').set(bearer(developerA)).expect(200);
    });

    it('DEVELOPER cannot reach /analytics/cost (403)', async () => {
      await http(ctx).get('/analytics/cost').set(bearer(developerA)).expect(403);
    });

    it('FINANCE sees cost everywhere, including /analytics/cost', async () => {
      const overview = await http(ctx).get('/analytics/overview').set(bearer(financeA)).expect(200);
      expect(overview.body.totalCost).toBe(0.06);

      await http(ctx).get('/analytics/cost').set(bearer(financeA)).expect(200);
    });

    it('TENANT_ADMIN (the tenant owner) has full access, cost included', async () => {
      const overview = await http(ctx).get('/analytics/overview').set(bearer(tenantA)).expect(200);
      expect(overview.body.totalCost).toBe(0.06);
      await http(ctx).get('/analytics/cost').set(bearer(tenantA)).expect(200);
    });

    it('rejects an unauthenticated request', async () => {
      await http(ctx).get('/analytics/overview').expect(401);
    });
  });

  describe('existing features still work', () => {
    it('the health check and a plain authenticated route are unaffected', async () => {
      await http(ctx).get('/health').expect(200);
      await http(ctx).get(`/tenants/${tenantA.tenantId}`).set(bearer(tenantA)).expect(200);
    });
  });
});

async function seedRequest(
  ctx: TestContext,
  input: {
    tenantId: string;
    projectId: string;
    apiKeyId: string;
    provider: 'GOOGLE' | 'OPENAI' | 'ANTHROPIC';
    model: string;
    tokens: number;
    costUsd: string;
  },
): Promise<void> {
  const aiRequest = await ctx.prisma.aiRequest.create({
    data: {
      tenantId: input.tenantId,
      projectId: input.projectId,
      apiKeyId: input.apiKeyId,
      provider: input.provider,
      model: input.model,
      requestTokens: Math.round(input.tokens * 0.7),
      responseTokens: Math.round(input.tokens * 0.3),
      totalTokens: input.tokens,
      latencyMs: 100,
      estimatedCost: input.costUsd,
      status: 'SUCCESS',
    },
  });
  await ctx.prisma.ledgerEntry.create({
    data: {
      tenantId: input.tenantId,
      requestId: aiRequest.id,
      transactionType: 'AI_USAGE',
      amount: `-${input.costUsd}`,
    },
  });
}
