import { hash } from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

/**
 * Local development data: a sample tenant with one user per role, teams, settings and an API key.
 *
 * Every user shares a publicly documented password, so this must never reach a shared or production
 * database. `index.ts` refuses to run it when NODE_ENV is "production".
 */
export const DEV_PASSWORD = 'ChangeMe123!';

const BCRYPT_ROUNDS = Number(process.env['BCRYPT_ROUNDS'] ?? 12);

const hashApiKey = (rawKey: string): string => createHash('sha256').update(rawKey).digest('hex');

const USERS = [
  { email: 'admin@techcorp.com', firstName: 'Ada', lastName: 'Admin', role: 'TENANT_ADMIN' },
  { email: 'developer@techcorp.com', firstName: 'Dev', lastName: 'Eloper', role: 'DEVELOPER' },
  { email: 'teamlead@techcorp.com', firstName: 'Alex', lastName: 'Leader', role: 'TEAM_ADMIN' },
  { email: 'finance@techcorp.com', firstName: 'Fin', lastName: 'Ance', role: 'FINANCE' },
  { email: 'viewer@techcorp.com', firstName: 'Vera', lastName: 'Viewer', role: 'VIEWER' },
] as const;

const TEAMS = [
  {
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
  {
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
  {
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
] as const;

const SETTINGS = [
  {
    category: 'GENERAL',
    key: 'general_config',
    value: {
      orgName: 'TechCorp AI',
      logoUrl: '',
      timezone: 'UTC',
      contactEmail: 'support@techcorp.com',
    },
  },
  {
    category: 'SECURITY',
    key: 'security_config',
    value: {
      sessionTimeoutMinutes: 60,
      passwordMinLength: 8,
      requireSpecialChar: true,
      defaultKeyExpiryDays: 90,
    },
  },
  {
    category: 'AI',
    key: 'ai_config',
    value: {
      defaultProvider: 'GOOGLE',
      allowedModels: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gpt-4o'],
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
    },
  },
  {
    category: 'NOTIFICATIONS',
    key: 'notification_config',
    value: {
      emailAlerts: true,
      alertEmail: 'ops@techcorp.com',
      budgetThresholds: [75, 90, 100],
      notifyOnKeyRevoke: true,
    },
  },
  {
    category: 'SYSTEM',
    key: 'system_config',
    value: {
      maintenanceMode: false,
      featureFlags: {
        streamingEnabled: false,
        piiMasking: true,
        promptGuard: true,
        teamLimits: true,
      },
    },
  },
] as const;

export async function seedDevData(prisma: PrismaClient): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'techcorp-ai' },
    update: {},
    create: { companyName: 'TechCorp AI', slug: 'techcorp-ai', plan: 'STARTUP' },
  });

  const passwordHash = await hash(DEV_PASSWORD, BCRYPT_ROUNDS);
  const userIds = new Map<string, string>();
  for (const user of USERS) {
    const row = await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, role: user.role },
      create: { ...user, tenantId: tenant.id, status: 'ACTIVE', passwordHash },
    });
    userIds.set(user.email, row.id);
  }

  const startupPlan = await prisma.billingPlan.findUnique({ where: { code: 'STARTUP' } });
  if (startupPlan) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await prisma.tenantSubscription.upsert({
      where: { tenantId: tenant.id },
      update: { planId: startupPlan.id },
      create: {
        tenantId: tenant.id,
        planId: startupPlan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        monthlyBudgetLimit: 250.0,
        dailyBudgetLimit: 25.0,
      },
    });
  }

  const teamIds = new Map<string, string>();
  for (const team of TEAMS) {
    const row = await prisma.team.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: team.name } },
      update: {},
      create: { tenantId: tenant.id, ...team, allowedModels: [...team.allowedModels] },
    });
    teamIds.set(team.name, row.id);
  }
  const engineeringTeamId = teamIds.get('Engineering Team')!;

  for (const [email, role] of [
    ['developer@techcorp.com', 'MEMBER'],
    ['teamlead@techcorp.com', 'LEAD'],
  ] as const) {
    const userId = userIds.get(email)!;
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: engineeringTeamId, userId } },
      update: {},
      create: { teamId: engineeringTeamId, userId, role },
    });
  }

  for (const setting of SETTINGS) {
    await prisma.systemSetting.upsert({
      where: {
        tenantId_category_key: {
          tenantId: tenant.id,
          category: setting.category,
          key: setting.key,
        },
      },
      update: { value: setting.value },
      create: { tenantId: tenant.id, ...setting },
    });
  }

  const project = await prisma.project.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Customer Support AI' } },
    update: { teamId: engineeringTeamId },
    create: {
      tenantId: tenant.id,
      name: 'Customer Support AI',
      description: 'Support chatbot for TechCorp customers',
      teamId: engineeringTeamId,
      allowedModels: ['gemini-2.0-flash', 'gemini-2.5-pro'],
      monthlyBudget: 150.0,
    },
  });

  await seedDevApiKey(prisma, { id: project.id, tenantId: tenant.id });
}

async function seedDevApiKey(
  prisma: PrismaClient,
  project: { id: string; tenantId: string },
): Promise<void> {
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
