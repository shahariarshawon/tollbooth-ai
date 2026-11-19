import type { Page } from '@playwright/test';

export interface MockUserOptions {
  id?: string;
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'DEVELOPER' | 'FINANCE';
  tenantId?: string;
  tenantName?: string;
  isDemo?: boolean;
}

export const SYNTHETIC_USER: MockUserOptions = {
  id: 'usr_test_123',
  userId: 'usr_test_123',
  email: 'admin@acme-corp.test',
  firstName: 'Jane',
  lastName: 'Admin',
  role: 'TENANT_ADMIN',
  tenantId: 'tnt_acme_456',
  tenantName: 'Acme Corp',
  isDemo: false,
};

export const SYNTHETIC_DEMO_USER: MockUserOptions = {
  id: 'usr_demo_synthetic',
  userId: 'usr_demo_synthetic',
  email: 'demo@tollbooth.test',
  firstName: 'Demo',
  lastName: 'User',
  role: 'TENANT_ADMIN',
  tenantId: 'tnt_demo_workspace',
  tenantName: 'Demo Workspace',
  isDemo: true,
};

export async function setupAuthenticatedContext(
  page: Page,
  user: MockUserOptions = SYNTHETIC_USER,
) {
  const userData = {
    id: user.id ?? user.userId ?? 'usr_1',
    userId: user.id ?? user.userId ?? 'usr_1',
    email: user.email ?? 'user@test.local',
    firstName: user.firstName ?? 'Jane',
    lastName: user.lastName ?? 'Admin',
    role: user.role ?? 'TENANT_ADMIN',
    tenantId: user.tenantId ?? 'tnt_1',
    tenantName: user.tenantName ?? 'Test Tenant',
    isDemo: !!user.isDemo,
  };

  // Set the tb_user, tb_at, tb_rt session cookies
  await page.context().addCookies([
    {
      name: 'tb_user',
      value: encodeURIComponent(JSON.stringify(userData)),
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'tb_at',
      value: 'synthetic_jwt_token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'tb_rt',
      value: 'synthetic_refresh_token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  // Intercept the Next.js BFF auth session endpoint
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: userData }),
    });
  });

  // Intercept common control plane overview endpoint matching DashboardOverview
  await page.route('**/api/cp/dashboard/overview*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        periodDays: 30,
        generatedAt: new Date().toISOString(),
        stats: {
          requests: 28540,
          tokens: 1420500,
          cost: user.role === 'DEVELOPER' ? null : 142.5,
          errorRate: 0.008,
          p95LatencyMs: 245,
          activeProjects: 3,
          activeApiKeys: 2,
        },
        requestVolume: [
          { date: '2026-11-01', requests: 1200, failures: 10 },
          { date: '2026-11-02', requests: 1450, failures: 8 },
        ],
        costTrend:
          user.role === 'DEVELOPER'
            ? null
            : [
                { date: '2026-11-01', cost: 12.5 },
                { date: '2026-11-02', cost: 15.0 },
              ],
        modelUsage: [
          { label: 'gemini-2.5-flash', value: 18400 },
          { label: 'gpt-4o-mini', value: 10140 },
        ],
        providerUsage: [
          { label: 'Gemini', value: 18400 },
          { label: 'OpenAI', value: 10140 },
        ],
        providers: [
          {
            id: 'gemini',
            name: 'Google Gemini',
            enabled: true,
            circuit: 'CLOSED',
            health: 'HEALTHY',
            recentRequests: 18400,
            recentFailures: 12,
          },
          {
            id: 'openai',
            name: 'OpenAI',
            enabled: true,
            circuit: 'CLOSED',
            health: 'HEALTHY',
            recentRequests: 10140,
            recentFailures: 8,
          },
        ],
        budget:
          user.role === 'DEVELOPER' ? null : { limitUsd: 200, spentUsd: 54.2, utilization: 0.271 },
        recentRequests: [],
        policyEvents: [],
      }),
    });
  });

  // Intercept API keys endpoint
  await page.route('**/api/cp/api-keys*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'key_prod_01',
          name: 'Production Gateway Key',
          keyPrefix: 'tb_live_prod',
          status: 'ACTIVE',
          permissions: ['chat:completions', 'models:read'],
          projectId: 'prj_01',
          projectName: 'Default Project',
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
          lastUsedAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'key_staging_02',
          name: 'Staging Integration Key',
          keyPrefix: 'tb_live_stg',
          status: 'ACTIVE',
          permissions: ['chat:completions'],
          projectId: 'prj_01',
          projectName: 'Default Project',
          createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
          lastUsedAt: null,
        },
      ]),
    });
  });

  // Intercept unread alerts endpoint
  await page.route('**/api/cp/alerts/unread*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Intercept Billing summary endpoint
  await page.route('**/api/cp/billing/summary*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentPlan: {
          name: 'Scale Pro',
          code: 'PRO',
          monthlyPrice: 79,
          description: 'Production traffic with rate limits and budgets',
          features: ['Up to 100k requests', '200k tokens / min'],
          status: 'ACTIVE',
        },
        monthlyLimit: 200,
        currentUsage: 54.2,
        remainingBudget: 145.8,
        estimatedCost: 54.2,
        totalTokens: 1420500,
        providerBreakdown: [
          { provider: 'gemini', cost: 24.2, requests: 15000, tokens: 800000, percentage: 44.6 },
          { provider: 'openai', cost: 30.0, requests: 13540, tokens: 620500, percentage: 55.4 },
        ],
      }),
    });
  });

  // Intercept Billing history endpoint
  await page.route('**/api/cp/billing/history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    });
  });

  // Intercept Billing plans endpoint
  await page.route('**/api/cp/billing/plans*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'plan_free',
          name: 'Free Trial',
          code: 'FREE',
          description: 'Explore the gateway for personal projects',
          monthlyPrice: 0,
          monthlyBudgetLimit: 50,
          dailyBudgetLimit: 5,
          requestsPerMinute: 60,
          requestsPerDay: 1000,
          tokensPerMinute: 40000,
          tokensPerDay: 500000,
          features: ['Community support'],
          isActive: true,
        },
        {
          id: 'plan_pro',
          name: 'Scale Pro',
          code: 'PRO',
          description: 'Production traffic with rate limits and budgets',
          monthlyPrice: 79,
          monthlyBudgetLimit: 200,
          dailyBudgetLimit: 15,
          requestsPerMinute: 300,
          requestsPerDay: 50000,
          tokensPerMinute: 200000,
          tokensPerDay: 2000000,
          features: ['Priority support', 'Dedicated rate limits'],
          isActive: true,
        },
      ]),
    });
  });

  // Intercept Analytics endpoints matching AnalyticsOverview, AnalyticsUsage, AnalyticsModels, AnalyticsCost
  await page.route('**/api/cp/analytics/overview*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        periodDays: 30,
        totalRequests: 28540,
        totalTokens: 1420500,
        totalCost: user.role === 'DEVELOPER' ? null : 142.5,
        activeUsers: 4,
        activeProjects: 3,
      }),
    });
  });

  await page.route('**/api/cp/analytics/usage*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        periodDays: 30,
        requestsOverTime: [
          { date: '2026-11-01', requests: 1200 },
          { date: '2026-11-02', requests: 1450 },
        ],
        tokensOverTime: [
          { date: '2026-11-01', tokens: 60000 },
          { date: '2026-11-02', tokens: 76000 },
        ],
        providerUsage: [
          { name: 'Gemini', count: 18400 },
          { name: 'OpenAI', count: 10140 },
        ],
        topProjects: [{ id: 'prj_01', name: 'Default Project', requests: 28540, tokens: 1420500 }],
        topApiKeys: [
          {
            id: 'key_prod_01',
            name: 'Production Gateway Key',
            projectName: 'Default Project',
            requests: 18400,
            tokens: 920000,
          },
        ],
      }),
    });
  });

  await page.route('**/api/cp/analytics/models*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        periodDays: 30,
        models: [
          {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            requests: 18400,
            tokens: 920000,
            cost: user.role === 'DEVELOPER' ? null : 42.5,
          },
          {
            provider: 'openai',
            model: 'gpt-4o-mini',
            requests: 10140,
            tokens: 500500,
            cost: user.role === 'DEVELOPER' ? null : 100.0,
          },
        ],
      }),
    });
  });

  await page.route('**/api/cp/analytics/cost*', async (route) => {
    if (user.role === 'DEVELOPER') {
      await route.fulfill({ status: 403, body: JSON.stringify({ message: 'Forbidden' }) });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          periodDays: 30,
          dailyCost: [
            { date: '2026-11-01', cost: 12.5 },
            { date: '2026-11-02', cost: 15.0 },
          ],
          monthlyCost: [{ month: '2026-11', cost: 142.5 }],
          providerCostBreakdown: [
            { name: 'gemini', count: 42.5 },
            { name: 'openai', count: 100.0 },
          ],
        }),
      });
    }
  });

  // Intercept alerts endpoint
  await page.route('**/api/cp/alerts*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Intercept projects endpoint
  await page.route('**/api/cp/projects*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'prj_01',
          name: 'Default Project',
          slug: 'default',
          createdAt: new Date().toISOString(),
        },
      ]),
    });
  });

  // Intercept audit logs endpoint
  await page.route('**/api/cp/audit-logs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        logs: [
          {
            id: 'log_01',
            action: 'API_KEY_CREATED',
            actorEmail: user.email,
            createdAt: new Date().toISOString(),
            metadata: { keyPrefix: 'tb_live_prod' },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      }),
    });
  });
}
