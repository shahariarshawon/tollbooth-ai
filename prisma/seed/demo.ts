import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

/**
 * The public demo workspace: a tenant flagged `isDemo`, with a month of generated traffic so the
 * dashboard has something to show. Safe to run in production and safe to run again, because:
 *
 * - it only ever touches the tenant whose slug is DEMO_TENANT_SLUG, and refuses to run if that slug
 *   belongs to a tenant that is not flagged `isDemo`, so it can never rewrite a real tenant's data;
 * - every user it creates has an unusable password: the only way in is the demo-session endpoint, which
 *   exists only when the control plane runs with DEMO_MODE on;
 * - it replaces the workspace's generated rows each run, so the traffic always ends today.
 *
 * Everything here is synthetic. Run `reference` first: the demo subscribes to a billing plan.
 *
 * These identity values must equal packages/shared/src/demo.ts. This script runs in an image without the
 * workspace packages, so it cannot import them; demo-identity.spec.ts fails if the two drift apart.
 */
const DEMO_TENANT_SLUG = 'demo-workspace';
const DEMO_USER_EMAIL = 'demo@tollbooth.invalid';
const UNUSABLE_PASSWORD_HASH = '!';

const DAYS = 30;

/** A small deterministic generator, so a re-run produces the same shape of traffic. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ModelMix {
  provider: 'GOOGLE' | 'OPENAI' | 'ANTHROPIC';
  model: string;
  /** Share of all requests. */
  weight: number;
  /** USD per million tokens, as in the reference catalogue. */
  inputPrice: number;
  outputPrice: number;
  /** Typical latency in ms. */
  latencyMs: number;
  /** Share of requests that fail. */
  failureRate: number;
}

const MODELS: ModelMix[] = [
  {
    provider: 'GOOGLE',
    model: 'gemini-2.0-flash',
    weight: 0.5,
    inputPrice: 0.1,
    outputPrice: 0.4,
    latencyMs: 650,
    failureRate: 0.012,
  },
  {
    provider: 'GOOGLE',
    model: 'gemini-2.5-pro',
    weight: 0.12,
    inputPrice: 1.25,
    outputPrice: 10,
    latencyMs: 2400,
    failureRate: 0.02,
  },
  {
    provider: 'OPENAI',
    model: 'gpt-4o-mini',
    weight: 0.25,
    inputPrice: 0.15,
    outputPrice: 0.6,
    latencyMs: 900,
    failureRate: 0.045,
  },
  {
    provider: 'ANTHROPIC',
    model: 'claude-sonnet-4-5',
    weight: 0.13,
    inputPrice: 3,
    outputPrice: 15,
    latencyMs: 1700,
    failureRate: 0.015,
  },
];

const hashKey = (raw: string): string => createHash('sha256').update(raw).digest('hex');

function pick<T extends { weight: number }>(items: T[], roll: number): T {
  let remaining = roll * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    remaining -= item.weight;
    if (remaining <= 0) return item;
  }
  return items[items.length - 1]!;
}

const FAKE_USERS = [
  {
    email: 'maya.rivera@demo.tollbooth.invalid',
    firstName: 'Maya',
    lastName: 'Rivera',
    role: 'DEVELOPER',
  },
  {
    email: 'sam.okafor@demo.tollbooth.invalid',
    firstName: 'Sam',
    lastName: 'Okafor',
    role: 'TEAM_ADMIN',
  },
  {
    email: 'lena.fischer@demo.tollbooth.invalid',
    firstName: 'Lena',
    lastName: 'Fischer',
    role: 'FINANCE',
  },
  { email: 'noah.kim@demo.tollbooth.invalid', firstName: 'Noah', lastName: 'Kim', role: 'VIEWER' },
] as const;

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.tenant.findUnique({ where: { slug: DEMO_TENANT_SLUG } });
  if (existing && !existing.isDemo) {
    throw new Error(
      `The tenant "${DEMO_TENANT_SLUG}" exists but is not flagged as the demo workspace. ` +
        'Refusing to overwrite it.',
    );
  }
  const plan = await prisma.billingPlan.findUnique({ where: { code: 'STARTUP' } });
  if (!plan) throw new Error('Billing plans are missing. Run "seed reference" before "seed demo".');

  const random = mulberry32(20261006);
  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: DEMO_TENANT_SLUG },
        update: { isDemo: true, status: 'ACTIVE' },
        create: {
          companyName: 'Demo Workspace',
          slug: DEMO_TENANT_SLUG,
          plan: 'STARTUP',
          isDemo: true,
        },
      });
      const tenantId = tenant.id;

      // Start from a clean slate: everything generated below is replaced, children before parents.
      await tx.ledgerEntry.deleteMany({ where: { tenantId } });
      await tx.usageEvent.deleteMany({ where: { tenantId } });
      await tx.aiRequest.deleteMany({ where: { tenantId } });
      await tx.alert.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.apiKey.deleteMany({ where: { tenantId } });
      await tx.project.deleteMany({ where: { tenantId } });
      await tx.team.deleteMany({ where: { tenantId } });
      await tx.systemSetting.deleteMany({ where: { tenantId } });

      const period = new Date(now);
      period.setMonth(period.getMonth() + 1);
      await tx.tenantSubscription.upsert({
        where: { tenantId },
        update: { planId: plan.id },
        create: {
          tenantId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: period,
          monthlyBudgetLimit: 50,
          dailyBudgetLimit: 5,
        },
      });

      const users = [
        {
          email: process.env['DEMO_USER_EMAIL'] ?? DEMO_USER_EMAIL,
          firstName: 'Demo',
          lastName: 'Visitor',
          role: 'TENANT_ADMIN',
        },
        ...FAKE_USERS,
      ] as const;
      const userIds = new Map<string, string>();
      for (const user of users) {
        const row = await tx.user.upsert({
          where: { email: user.email },
          update: {
            tenantId,
            role: user.role,
            status: 'ACTIVE',
            passwordHash: UNUSABLE_PASSWORD_HASH,
          },
          create: { ...user, tenantId, status: 'ACTIVE', passwordHash: UNUSABLE_PASSWORD_HASH },
        });
        userIds.set(user.email, row.id);
      }
      const adminId = userIds.get(process.env['DEMO_USER_EMAIL'] ?? DEMO_USER_EMAIL)!;

      const platform = await tx.team.create({
        data: {
          tenantId,
          name: 'Platform',
          description: 'Shared AI infrastructure',
          rateLimitRpm: 120,
          tokenLimitTpm: 200000,
          monthlyBudget: 30,
          allowedModels: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gpt-4o-mini'],
        },
      });
      const support = await tx.team.create({
        data: {
          tenantId,
          name: 'Customer Support',
          description: 'Support automation',
          rateLimitRpm: 60,
          tokenLimitTpm: 100000,
          monthlyBudget: 15,
          allowedModels: ['gemini-2.0-flash', 'gpt-4o-mini'],
        },
      });
      for (const [email, team, role] of [
        ['maya.rivera@demo.tollbooth.invalid', platform.id, 'MEMBER'],
        ['sam.okafor@demo.tollbooth.invalid', support.id, 'LEAD'],
      ] as const) {
        await tx.teamMember.create({ data: { teamId: team, userId: userIds.get(email)!, role } });
      }

      const projectDefs = [
        {
          name: 'Support Assistant',
          description: 'Answers customer questions',
          teamId: support.id,
        },
        { name: 'Docs Search', description: 'Summarises documentation hits', teamId: platform.id },
        { name: 'Release Notes Writer', description: 'Drafts changelogs', teamId: platform.id },
      ];
      const projects = [];
      for (const definition of projectDefs) {
        projects.push(await tx.project.create({ data: { tenantId, ...definition } }));
      }

      const keyDefs = [
        { name: 'Support production', project: 0, status: 'ACTIVE', last: 0.01 },
        { name: 'Support staging', project: 0, status: 'ACTIVE', last: 1.5 },
        { name: 'Docs service', project: 1, status: 'ACTIVE', last: 0.02 },
        { name: 'Release notes CI', project: 2, status: 'ACTIVE', last: 2.2 },
        { name: 'Old prototype key', project: 1, status: 'REVOKED', last: 21 },
      ] as const;
      const keys = [];
      for (const definition of keyDefs) {
        const raw = `tb_demo_${randomBytes(24).toString('hex')}`;
        keys.push(
          await tx.apiKey.create({
            data: {
              tenantId,
              projectId: projects[definition.project]!.id,
              teamId: projectDefs[definition.project]!.teamId,
              name: definition.name,
              keyHash: hashKey(raw),
              keyPrefix: raw.slice(0, 14),
              permissions: ['chat:completions'],
              status: definition.status,
              lastUsedAt: new Date(now.getTime() - definition.last * 86_400_000),
            },
          }),
        );
      }
      // Revoked keys carry no traffic of their own in the last days.
      const liveKeys = keys.filter((_, index) => keyDefs[index]!.status === 'ACTIVE');

      const requests = [];
      const ledger = [];
      for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
        const day = new Date(now);
        day.setUTCDate(day.getUTCDate() - daysAgo);
        const weekday = day.getUTCDay();
        const base = weekday === 0 || weekday === 6 ? 14 : 38;
        const growth = 1 + (DAYS - daysAgo) / (DAYS * 2);
        const count = Math.round(base * growth * (0.8 + random() * 0.4));
        // Today only has requests up to the current time.
        const hourCap = daysAgo === 0 ? Math.max(1, now.getUTCHours()) : 24;

        for (let index = 0; index < count; index += 1) {
          const mix = pick(MODELS, random());
          const key = liveKeys[Math.floor(random() * liveKeys.length)]!;
          const keyIndex = keys.indexOf(key);
          const failed = random() < mix.failureRate;
          const inputTokens = Math.round(150 + random() * 1400);
          const outputTokens = failed ? 0 : Math.round(60 + random() * 700);
          const cost = failed
            ? 0
            : (inputTokens * mix.inputPrice + outputTokens * mix.outputPrice) / 1_000_000;
          const createdAt = new Date(
            Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) +
              Math.floor(random() * hourCap * 3_600_000),
          );
          const id = randomUUID();
          requests.push({
            id,
            tenantId,
            projectId: projects[keyDefs[keyIndex]!.project]!.id,
            apiKeyId: key.id,
            provider: mix.provider,
            model: mix.model,
            requestTokens: inputTokens,
            responseTokens: outputTokens,
            totalTokens: inputTokens + outputTokens,
            latencyMs: Math.round(mix.latencyMs * (0.6 + random() * 0.9) * (failed ? 2.2 : 1)),
            estimatedCost: cost.toFixed(8),
            status: failed ? ('FAILED' as const) : ('SUCCESS' as const),
            errorMessage: failed ? 'provider_unavailable' : null,
            createdAt,
          });
          if (!failed) {
            ledger.push({
              tenantId,
              requestId: id,
              transactionType: 'AI_USAGE' as const,
              amount: (-cost).toFixed(8),
              description: `${mix.model} usage`,
              createdAt,
            });
          }
        }
      }
      await tx.aiRequest.createMany({ data: requests });
      await tx.ledgerEntry.createMany({ data: ledger });

      const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
      await tx.alert.createMany({
        data: [
          {
            tenantId,
            type: 'SECURITY_ALERT',
            severity: 'CRITICAL',
            message: 'A request to Support Assistant was blocked: possible prompt injection.',
            createdAt: hoursAgo(5),
          },
          {
            tenantId,
            type: 'BUDGET_LIMIT',
            severity: 'WARNING',
            message: 'The workspace has used 80% of its monthly budget.',
            createdAt: hoursAgo(30),
          },
          {
            tenantId,
            type: 'PROVIDER_ERROR',
            severity: 'WARNING',
            message: 'OpenAI returned several rate-limit errors in a short period.',
            status: 'READ',
            readAt: hoursAgo(48),
            createdAt: hoursAgo(52),
          },
          {
            tenantId,
            type: 'SECURITY_ALERT',
            severity: 'WARNING',
            message: 'Personal data was redacted from a request to Docs Search.',
            status: 'READ',
            readAt: hoursAgo(70),
            createdAt: hoursAgo(75),
          },
        ],
      });

      await tx.auditLog.createMany({
        data: [
          { action: 'LOGIN_SUCCESS', resource: 'auth', createdAt: hoursAgo(2) },
          { action: 'API_KEY_CREATED', resource: 'api_keys', createdAt: hoursAgo(26) },
          { action: 'PROJECT_CREATED', resource: 'projects', createdAt: hoursAgo(120) },
          { action: 'TEAM_CREATED', resource: 'teams', createdAt: hoursAgo(300) },
          { action: 'API_KEY_REVOKED', resource: 'api_keys', createdAt: hoursAgo(400) },
        ].map((entry) => ({
          ...entry,
          tenantId,
          userId: adminId,
          metadata: { source: 'demo-seed' },
        })),
      });

      await tx.systemSetting.create({
        data: {
          tenantId,
          category: 'GENERAL',
          key: 'general_config',
          value: {
            orgName: 'Demo Workspace',
            logoUrl: '',
            timezone: 'UTC',
            contactEmail: 'demo@demo.tollbooth.invalid',
          },
        },
      });

      console.log(
        `Demo workspace ready: ${requests.length} generated requests over ${DAYS} days. ` +
          'Sessions need DEMO_MODE=true on the control plane and dashboard.',
      );
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}
