import { hash } from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient, ProviderType } from '@prisma/client';

const prisma = new PrismaClient();

// Development-only credential shared by the seeded users. Never use it outside local environments.
const DEV_PASSWORD = 'ChangeMe123!';

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Gemini is the active provider. OpenAI and Anthropic stay in the catalogue, implemented in the gateway
 * and ready to switch on, but DISABLED: the router will not send them traffic until their status is
 * set to ACTIVE (and their API key is configured).
 *
 * `configuration.tier` says whether the provider account is billed: "free" (a Google AI Studio key on
 * the free plan costs nothing) or "paid". Re-seeding never overwrites a tier you have already chosen.
 */
const PROVIDERS = [
  { name: 'Google Gemini', type: ProviderType.GOOGLE, status: 'ACTIVE', defaultTier: 'free' },
  { name: 'OpenAI', type: ProviderType.OPENAI, status: 'DISABLED', defaultTier: 'paid' },
  { name: 'Anthropic', type: ProviderType.ANTHROPIC, status: 'DISABLED', defaultTier: 'paid' },
] as const;

async function seedProviders() {
  // Databases seeded before Gemini became the primary provider have a row called "Google".
  const legacy = await prisma.aiProvider.findUnique({ where: { name: 'Google' } });
  if (legacy && !(await prisma.aiProvider.findUnique({ where: { name: 'Google Gemini' } }))) {
    await prisma.aiProvider.update({ where: { id: legacy.id }, data: { name: 'Google Gemini' } });
  }

  const providers = new Map<ProviderType, string>();
  for (const definition of PROVIDERS) {
    const existing = await prisma.aiProvider.findUnique({ where: { name: definition.name } });
    const configuration = (existing?.configuration ?? {}) as Record<string, unknown>;
    const provider = await prisma.aiProvider.upsert({
      where: { name: definition.name },
      update: {
        status: definition.status,
        configuration: { ...configuration, tier: configuration['tier'] ?? definition.defaultTier },
      },
      create: {
        name: definition.name,
        type: definition.type,
        status: definition.status,
        configuration: { tier: definition.defaultTier },
      },
    });
    providers.set(provider.type, provider.id);
  }
  return providers;
}

async function seedModels(providers: Map<ProviderType, string>) {
  // Prices are USD per 1,000,000 tokens, at paid-tier rates, and are development values: check them
  // against each provider's current price list before relying on them for money.
  const models = [
    { type: ProviderType.GOOGLE, modelName: 'gemini-2.0-flash', input: '0.10', output: '0.40' },
    {
      type: ProviderType.GOOGLE,
      modelName: 'gemini-2.0-flash-lite',
      input: '0.075',
      output: '0.30',
    },
    { type: ProviderType.GOOGLE, modelName: 'gemini-2.5-flash', input: '0.30', output: '2.50' },
    { type: ProviderType.GOOGLE, modelName: 'gemini-2.5-pro', input: '1.25', output: '10.00' },
    { type: ProviderType.OPENAI, modelName: 'gpt-4', input: '30.00', output: '60.00' },
    { type: ProviderType.OPENAI, modelName: 'gpt-4o', input: '2.50', output: '10.00' },
    { type: ProviderType.OPENAI, modelName: 'gpt-4o-mini', input: '0.15', output: '0.60' },
    {
      type: ProviderType.ANTHROPIC,
      modelName: 'claude-sonnet-4-5',
      input: '3.00',
      output: '15.00',
    },
  ];
  for (const model of models) {
    const providerId = providers.get(model.type);
    if (!providerId) throw new Error(`Provider ${model.type} was not seeded`);
    await prisma.aiModel.upsert({
      where: { providerId_modelName: { providerId, modelName: model.modelName } },
      update: {},
      create: {
        providerId,
        modelName: model.modelName,
        inputTokenPrice: model.input,
        outputTokenPrice: model.output,
      },
    });
  }
}

async function seedBillingPlans() {
  const plans = [
    {
      name: 'Free Tier',
      code: 'FREE',
      description: 'Ideal for evaluation and experimenting with LLM APIs.',
      monthlyPrice: '0.00',
      monthlyBudgetLimit: '25.00',
      dailyBudgetLimit: '5.00',
      requestsPerMinute: 30,
      requestsPerDay: 1000,
      tokensPerMinute: 50000,
      tokensPerDay: 500000,
      features: ['Gemini Flash access', 'Community support', 'Basic rate limiting'],
    },
    {
      name: 'Startup',
      code: 'STARTUP',
      description: 'For growing teams building production AI features.',
      monthlyPrice: '49.00',
      monthlyBudgetLimit: '250.00',
      dailyBudgetLimit: '25.00',
      requestsPerMinute: 120,
      requestsPerDay: 20000,
      tokensPerMinute: 250000,
      tokensPerDay: 5000000,
      features: ['All Gemini & OpenAI models', 'Team management', 'Cost & budget alerts', 'Audit logs'],
    },
    {
      name: 'Business',
      code: 'BUSINESS',
      description: 'High throughput, multi-team governance and custom limits.',
      monthlyPrice: '199.00',
      monthlyBudgetLimit: '1000.00',
      dailyBudgetLimit: '100.00',
      requestsPerMinute: 600,
      requestsPerDay: 100000,
      tokensPerMinute: 1000000,
      tokensPerDay: 25000000,
      features: ['Multi-provider routing', 'Advanced RBAC & teams', 'Real-time telemetry', 'Priority support'],
    },
    {
      name: 'Enterprise',
      code: 'ENTERPRISE',
      description: 'Dedicated infrastructure, custom SLAs, and custom limits.',
      monthlyPrice: '799.00',
      monthlyBudgetLimit: '5000.00',
      dailyBudgetLimit: '500.00',
      requestsPerMinute: 2400,
      requestsPerDay: 1000000,
      tokensPerMinute: 5000000,
      tokensPerDay: 100000000,
      features: ['Custom provider keys', 'Dedicated Redis cluster', 'Custom legal terms', '24/7 dedicated support'],
    },
  ];

  for (const plan of plans) {
    await prisma.billingPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        monthlyBudgetLimit: plan.monthlyBudgetLimit,
        dailyBudgetLimit: plan.dailyBudgetLimit,
        requestsPerMinute: plan.requestsPerMinute,
        requestsPerDay: plan.requestsPerDay,
        tokensPerMinute: plan.tokensPerMinute,
        tokensPerDay: plan.tokensPerDay,
        features: plan.features,
      },
      create: {
        name: plan.name,
        code: plan.code,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        monthlyBudgetLimit: plan.monthlyBudgetLimit,
        dailyBudgetLimit: plan.dailyBudgetLimit,
        requestsPerMinute: plan.requestsPerMinute,
        requestsPerDay: plan.requestsPerDay,
        tokensPerMinute: plan.tokensPerMinute,
        tokensPerDay: plan.tokensPerDay,
        features: plan.features,
      },
    });
  }
}

async function seedPermissions() {
  const permissions = [
    { name: 'TENANT_MANAGE', module: 'tenants', description: 'Create and manage tenants' },
    { name: 'USER_READ', module: 'users', description: 'View tenant users' },
    { name: 'USER_CREATE', module: 'users', description: 'Invite new users' },
    { name: 'USER_UPDATE', module: 'users', description: 'Update user profiles and roles' },
    { name: 'USER_DELETE', module: 'users', description: 'Deactivate or remove users' },
    { name: 'TEAM_READ', module: 'teams', description: 'View teams and members' },
    { name: 'TEAM_MANAGE', module: 'teams', description: 'Create and manage teams, limits and members' },
    { name: 'PROJECT_READ', module: 'projects', description: 'View projects' },
    { name: 'PROJECT_MANAGE', module: 'projects', description: 'Create, configure and archive projects' },
    { name: 'API_KEY_READ', module: 'api-keys', description: 'View API keys' },
    { name: 'API_KEY_CREATE', module: 'api-keys', description: 'Generate new API keys' },
    { name: 'API_KEY_DELETE', module: 'api-keys', description: 'Revoke and delete API keys' },
    { name: 'VIEW_ANALYTICS', module: 'analytics', description: 'View usage analytics and reports' },
    { name: 'VIEW_BILLING', module: 'billing', description: 'View billing summary and invoices' },
    { name: 'MANAGE_BILLING', module: 'billing', description: 'Change plans and adjust budgets' },
    { name: 'VIEW_AUDIT_LOGS', module: 'audit', description: 'Inspect audit trail and export logs' },
    { name: 'MANAGE_SETTINGS', module: 'settings', description: 'Configure organization, security, AI policies' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { module: perm.module, description: perm.description },
      create: { name: perm.name, module: perm.module, description: perm.description },
    });
  }
}

async function seedTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'techcorp-ai' },
    update: {},
    create: { companyName: 'TechCorp AI', slug: 'techcorp-ai', plan: 'STARTUP' },
  });

  const users = [
    { email: 'admin@techcorp.com', firstName: 'Ada', lastName: 'Admin', role: 'TENANT_ADMIN' as const },
    { email: 'developer@techcorp.com', firstName: 'Dev', lastName: 'Eloper', role: 'DEVELOPER' as const },
    { email: 'teamlead@techcorp.com', firstName: 'Alex', lastName: 'Leader', role: 'TEAM_ADMIN' as const },
    { email: 'finance@techcorp.com', firstName: 'Fin', lastName: 'Ance', role: 'FINANCE' as const },
    { email: 'viewer@techcorp.com', firstName: 'Vera', lastName: 'Viewer', role: 'VIEWER' as const },
  ] as const;

  const passwordHash = await hashPassword(DEV_PASSWORD);
  const createdUsers: Record<string, string> = {};

  for (const user of users) {
    const dbUser = await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, role: user.role },
      create: { ...user, tenantId: tenant.id, status: 'ACTIVE', passwordHash },
    });
    createdUsers[user.email] = dbUser.id;
  }

  // Assign Subscription
  const startupPlan = await prisma.billingPlan.findUnique({ where: { code: 'STARTUP' } });
  if (startupPlan) {
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    await prisma.tenantSubscription.upsert({
      where: { tenantId: tenant.id },
      update: { planId: startupPlan.id },
      create: {
        tenantId: tenant.id,
        planId: startupPlan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: end,
        monthlyBudgetLimit: 250.0,
        dailyBudgetLimit: 25.0,
      },
    });
  }

  // Seed Teams
  const engineeringTeam = await prisma.team.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Engineering Team' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Engineering Team',
      description: 'Core backend and AI infrastructure engineering',
      rateLimitRpm: 120,
      rateLimitRpd: 15000,
      tokenLimitTpm: 200000,
      tokenLimitTpd: 3000000,
      dailyBudget: 20.0,
      monthlyBudget: 200.0,
      allowedModels: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gpt-4o'],
    },
  });

  const marketingTeam = await prisma.team.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Marketing Team' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Marketing Team',
      description: 'Content generation and marketing automation',
      rateLimitRpm: 30,
      rateLimitRpd: 2000,
      tokenLimitTpm: 50000,
      tokenLimitTpd: 500000,
      dailyBudget: 5.0,
      monthlyBudget: 40.0,
      allowedModels: ['gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    },
  });

  await prisma.team.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Research Team' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Research Team',
      description: 'Data science and exploratory prompt experimentation',
      rateLimitRpm: 60,
      rateLimitRpd: 5000,
      tokenLimitTpm: 100000,
      tokenLimitTpd: 1500000,
      dailyBudget: 15.0,
      monthlyBudget: 150.0,
      allowedModels: ['gemini-2.5-pro', 'gpt-4', 'claude-sonnet-4-5'],
    },
  });

  // Assign Team Members
  if (createdUsers['developer@techcorp.com']) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: engineeringTeam.id, userId: createdUsers['developer@techcorp.com'] } },
      update: {},
      create: { teamId: engineeringTeam.id, userId: createdUsers['developer@techcorp.com'], role: 'MEMBER' },
    });
  }
  if (createdUsers['teamlead@techcorp.com']) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: engineeringTeam.id, userId: createdUsers['teamlead@techcorp.com'] } },
      update: {},
      create: { teamId: engineeringTeam.id, userId: createdUsers['teamlead@techcorp.com'], role: 'LEAD' },
    });
  }

  // Seed System Settings
  const settings = [
    {
      category: 'GENERAL',
      key: 'general_config',
      value: { orgName: 'TechCorp AI', logoUrl: '', timezone: 'UTC', contactEmail: 'support@techcorp.com' },
    },
    {
      category: 'SECURITY',
      key: 'security_config',
      value: { sessionTimeoutMinutes: 60, passwordMinLength: 8, requireSpecialChar: true, defaultKeyExpiryDays: 90 },
    },
    {
      category: 'AI',
      key: 'ai_config',
      value: { defaultProvider: 'GOOGLE', allowedModels: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gpt-4o'], maxInputTokens: 4096, maxOutputTokens: 4096 },
    },
    {
      category: 'NOTIFICATIONS',
      key: 'notification_config',
      value: { emailAlerts: true, alertEmail: 'ops@techcorp.com', budgetThresholds: [75, 90, 100], notifyOnKeyRevoke: true },
    },
    {
      category: 'SYSTEM',
      key: 'system_config',
      value: { maintenanceMode: false, featureFlags: { streamingEnabled: false, piiMasking: true, promptGuard: true, teamLimits: true } },
    },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { tenantId_category_key: { tenantId: tenant.id, category: s.category, key: s.key } },
      update: { value: s.value },
      create: { tenantId: tenant.id, category: s.category, key: s.key, value: s.value },
    });
  }

  const project = await prisma.project.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Customer Support AI' } },
    update: { teamId: engineeringTeam.id },
    create: {
      tenantId: tenant.id,
      name: 'Customer Support AI',
      description: 'Support chatbot for TechCorp customers',
      teamId: engineeringTeam.id,
      allowedModels: ['gemini-2.0-flash', 'gemini-2.5-pro'],
      monthlyBudget: 150.0,
    },
  });

  // Sample Audit Logs
  if (createdUsers['admin@techcorp.com']) {
    await prisma.auditLog.createMany({
      data: [
        {
          tenantId: tenant.id,
          userId: createdUsers['admin@techcorp.com'],
          action: 'LOGIN_SUCCESS',
          resource: 'auth',
          metadata: { email: 'admin@techcorp.com' },
          ipAddress: '127.0.0.1',
        },
        {
          tenantId: tenant.id,
          userId: createdUsers['admin@techcorp.com'],
          action: 'TEAM_CREATED',
          resource: 'teams',
          resourceId: engineeringTeam.id,
          metadata: { teamName: 'Engineering Team', budget: 200 },
          ipAddress: '127.0.0.1',
        },
        {
          tenantId: tenant.id,
          userId: createdUsers['admin@techcorp.com'],
          action: 'SETTINGS_CHANGED',
          resource: 'settings',
          resourceId: 'ai_config',
          metadata: { updatedCategory: 'AI', defaultProvider: 'GOOGLE' },
          ipAddress: '127.0.0.1',
        },
      ],
    });
  }

  return project;
}

async function seedApiKey(project: { id: string; tenantId: string }) {
  const name = 'Development key';
  const existing = await prisma.apiKey.findFirst({ where: { projectId: project.id, name } });
  if (existing) {
    console.log('Development API key already exists; its raw value is not recoverable.');
    return;
  }

  const rawKey = `tb_dev_${randomBytes(24).toString('hex')}`;
  await prisma.apiKey.create({
    data: {
      tenantId: project.tenantId,
      projectId: project.id,
      name,
      keyHash: hashApiKey(rawKey),
      keyPrefix: rawKey.slice(0, 11),
      permissions: ['chat:completions'],
      rateLimit: 60,
    },
  });
  console.log(`Development API key (shown once, only its hash is stored): ${rawKey}`);
}

async function main() {
  const providers = await seedProviders();
  await seedModels(providers);
  await seedBillingPlans();
  await seedPermissions();
  const project = await seedTenant();
  await seedApiKey(project);
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
