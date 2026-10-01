import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@tollbooth/database';
import type { ApiKeyStatus, TenantPlan } from '@tollbooth/database';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiKeyService } from '../../src/api-key/api-key.service';
import { AppModule } from '../../src/app.module';
import { CIRCUIT_OPTIONS } from '../../src/circuit-breaker/circuit-breaker.service';
import type { CircuitBreakerOptions } from '../../src/circuit-breaker/circuit-breaker.service';
import { configureApp } from '../../src/configure-app';
import { RedisService } from '../../src/redis/redis.service';
import { DEFAULT_PLAN_LIMITS, PLAN_LIMITS } from '../../src/traffic/plan-limits';
import type { PlanLimits } from '../../src/traffic/plan-limits';
import { FAKE_ANTHROPIC_API_KEY, startFakeAnthropic } from './fake-anthropic';
import { FAKE_GEMINI_API_KEY, startFakeGemini } from './fake-gemini';
import { startFakeOpenAi } from './fake-openai';
import type { FakeOpenAi } from './fake-openai';
import type { FakeProvider } from './fake-server';

/** The three providers, each backed by a local fake that speaks its real wire format. */
export interface Fakes {
  gemini: FakeProvider;
  openai: FakeOpenAi;
  anthropic: FakeProvider;
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  /** The fake Gemini, the active provider. Most tests only need this one. */
  fake: FakeProvider;
  fakes: Fakes;
  redis: RedisService;
  tenantIds: string[];
  modelIds: string[];
  providerIds: string[];
  /** Provider rows as they were before the suite changed them, put back at the end. */
  providerSnapshots: { id: string; status: 'ACTIVE' | 'DISABLED'; configuration: object }[];
}

export interface Fixture {
  tenantId: string;
  projectId: string;
  /** A key that may call chat completions. */
  key: { id: string; raw: string };
}

export interface ContextOptions {
  /** Environment for this app instance only, for example to point it at a dead Redis. */
  env?: Record<string, string>;
  /** Replaces the plan table, to make limits small enough to hit in a test. */
  planLimits?: Partial<Record<TenantPlan, Partial<PlanLimits>>>;
  circuit?: Partial<CircuitBreakerOptions>;
}

/**
 * Boots the real gateway against the real database and Redis, with the three AI providers replaced by
 * local fakes. Gemini is active, as in production; OpenAI and Anthropic are switched off in the database
 * until a test turns them on with setProvider().
 */
export async function createTestContext(options: ContextOptions = {}): Promise<TestContext> {
  const fakes: Fakes = {
    gemini: await startFakeGemini(),
    openai: await startFakeOpenAi(),
    anthropic: await startFakeAnthropic(),
  };
  const closeFakes = () => Promise.all(Object.values(fakes).map((fake) => fake.close()));

  const saved = { ...process.env };
  // Read by the config module while the application is built below, then put back. Fake keys always
  // win over whatever real keys the developer has in .env.
  Object.assign(process.env, {
    GOOGLE_AI_API_KEY: FAKE_GEMINI_API_KEY,
    GOOGLE_AI_BASE_URL: fakes.gemini.url,
    OPENAI_API_KEY: 'sk-test-e2e-not-a-real-key',
    OPENAI_BASE_URL: fakes.openai.url,
    ANTHROPIC_API_KEY: FAKE_ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: fakes.anthropic.url,
    ...(options.env ?? {}),
  });

  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.planLimits) {
    const table = Object.fromEntries(
      (Object.keys(DEFAULT_PLAN_LIMITS) as TenantPlan[]).map((plan) => [
        plan,
        { ...DEFAULT_PLAN_LIMITS[plan], ...options.planLimits?.[plan] },
      ]),
    );
    builder.overrideProvider(PLAN_LIMITS).useValue(table);
  }
  if (options.circuit) {
    builder.overrideProvider(CIRCUIT_OPTIONS).useFactory({
      factory: () => ({
        failureThreshold: 5,
        openMs: 30_000,
        failureWindowMs: 60_000,
        successesToClose: 2,
        probeTimeoutMs: 10_000,
        ...options.circuit,
      }),
    });
  }

  let app: NestExpressApplication;
  try {
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
  } catch (error) {
    // Do not leave the fake servers listening: they would keep the test process alive forever.
    await closeFakes();
    throw error;
  } finally {
    process.env = saved;
  }

  const context: TestContext = {
    app,
    prisma: app.get(PrismaService),
    fake: fakes.gemini,
    fakes,
    redis: app.get(RedisService),
    tenantIds: [],
    modelIds: [],
    providerIds: [],
    providerSnapshots: [],
  };
  await ensureCatalogue(context);
  return context;
}

export function http(context: TestContext) {
  return request(context.app.getHttpServer());
}

const unique = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

type ProviderName = 'Google Gemini' | 'OpenAI' | 'Anthropic';

/**
 * Turns a provider on or off, and sets whether its account is billed, in the database. The router reads
 * the row on every request, so the change applies at once. Whatever the row was before the suite started
 * is restored by destroyTestContext.
 */
export async function setProvider(
  context: TestContext,
  name: ProviderName,
  settings: { status?: 'ACTIVE' | 'DISABLED'; tier?: 'free' | 'paid' },
): Promise<void> {
  await context.prisma.aiProvider.update({
    where: { name },
    data: {
      ...(settings.status && { status: settings.status }),
      ...(settings.tier && { configuration: { tier: settings.tier } }),
    },
  });
}

/**
 * The providers and models the tests rely on. Upserts, so they coexist with the development seed, and
 * the state the suite starts from matches production: Gemini active (on a paid tier here, so that cost
 * and budget move), OpenAI and Anthropic present but disabled.
 */
async function ensureCatalogue(context: TestContext): Promise<void> {
  const { prisma } = context;
  const definitions = [
    { name: 'Google Gemini', type: 'GOOGLE', status: 'ACTIVE', tier: 'paid' },
    { name: 'OpenAI', type: 'OPENAI', status: 'DISABLED', tier: 'paid' },
    { name: 'Anthropic', type: 'ANTHROPIC', status: 'DISABLED', tier: 'paid' },
  ] as const;

  const ids = new Map<string, string>();
  for (const definition of definitions) {
    const before = await prisma.aiProvider.findUnique({ where: { name: definition.name } });
    if (before) {
      context.providerSnapshots.push({
        id: before.id,
        status: before.status,
        configuration: (before.configuration ?? {}) as object,
      });
    }
    const provider = await prisma.aiProvider.upsert({
      where: { name: definition.name },
      update: { status: definition.status, configuration: { tier: definition.tier } },
      create: {
        name: definition.name,
        type: definition.type,
        status: definition.status,
        configuration: { tier: definition.tier },
      },
    });
    ids.set(definition.name, provider.id);
  }
  const gemini = ids.get('Google Gemini')!;
  const openai = ids.get('OpenAI')!;
  const anthropic = ids.get('Anthropic')!;

  for (const [providerId, modelName] of [
    [gemini, 'gemini-2.0-flash'],
    [gemini, 'gemini-2.0-flash-lite'],
    [gemini, 'gemini-2.5-flash'],
    [openai, 'gpt-4'],
    [openai, 'gpt-4o-mini'],
    [anthropic, 'claude-sonnet-4-5'],
  ] as const) {
    await prisma.aiModel.upsert({
      where: { providerId_modelName: { providerId, modelName } },
      update: { isActive: true },
      create: { providerId, modelName, inputTokenPrice: '1.00', outputTokenPrice: '2.00' },
    });
  }

  // These exist only for the duration of the suite. An upsert, so a run that was interrupted before
  // cleanup cannot break the next one.
  const inactive = await prisma.aiModel.upsert({
    where: { providerId_modelName: { providerId: gemini, modelName: 'e2e-inactive-model' } },
    update: { isActive: false },
    create: {
      providerId: gemini,
      modelName: 'e2e-inactive-model',
      inputTokenPrice: '1.00',
      outputTokenPrice: '2.00',
      isActive: false,
    },
  });
  const disabledProvider = await prisma.aiProvider.create({
    data: { name: unique('E2E Disabled Provider'), type: 'GOOGLE', status: 'DISABLED' },
  });
  const onDisabled = await prisma.aiModel.create({
    data: {
      providerId: disabledProvider.id,
      modelName: 'e2e-disabled-provider-model',
      inputTokenPrice: '1.00',
      outputTokenPrice: '2.00',
    },
  });
  context.modelIds.push(inactive.id, onDisabled.id);
  context.providerIds.push(disabledProvider.id);
}

export async function createFixture(
  context: TestContext,
  plan: TenantPlan = 'FREE',
): Promise<Fixture> {
  const slug = unique('gw');
  const tenant = await context.prisma.tenant.create({
    data: { companyName: `Gateway Test ${slug}`, slug, plan },
  });
  context.tenantIds.push(tenant.id);
  const project = await context.prisma.project.create({
    data: { tenantId: tenant.id, name: 'Test project' },
  });
  const key = await createKey(context, tenant.id, project.id);
  return { tenantId: tenant.id, projectId: project.id, key };
}

export async function createKey(
  context: TestContext,
  tenantId: string,
  projectId: string,
  overrides: {
    permissions?: string[];
    status?: ApiKeyStatus;
    expiresAt?: Date | null;
    rateLimit?: number;
  } = {},
): Promise<{ id: string; raw: string }> {
  const raw = `tb_e2e_${randomBytes(24).toString('hex')}`;
  const row = await context.prisma.apiKey.create({
    data: {
      tenantId,
      projectId,
      name: unique('key'),
      keyHash: ApiKeyService.hash(raw),
      keyPrefix: raw.slice(0, 11),
      permissions: overrides.permissions ?? ['chat:completions'],
      status: overrides.status ?? 'ACTIVE',
      expiresAt: overrides.expiresAt ?? null,
      rateLimit: overrides.rateLimit ?? null,
    },
  });
  return { id: row.id, raw };
}

/**
 * Forgets every counter of the tenants created so far, plus the provider circuits, so a test starts from
 * a clean slate. Other suites and other tenants are untouched.
 */
export async function resetTrafficState(context: TestContext): Promise<void> {
  const { client } = context.redis;
  // Nothing to clear (and no way to clear it) when a test has deliberately taken Redis away.
  if (client.status !== 'ready') return;
  const patterns = [...context.tenantIds.map((id) => `tenant:{${id}}:*`), 'provider:*:circuit'];
  for (const pattern of patterns) {
    const keys = await client.keys(pattern);
    if (keys.length > 0) await client.del(...keys);
  }
}

/** Current value of a tenant-wide per-minute counter ("requests" or "tokens"); 0 when there is none. */
export async function tenantCounter(
  context: TestContext,
  tenantId: string,
  kind: 'requests' | 'tokens',
): Promise<number> {
  const [key] = await context.redis.client.keys(`tenant:{${tenantId}}:${kind}:*`);
  return key ? Number(await context.redis.client.get(key)) : 0;
}

/** The default model of the tests: Gemini, the active provider. */
export const DEFAULT_MODEL = 'gemini-2.0-flash';

export const chat = (content = 'Hello', extra: Record<string, unknown> = {}) => ({
  model: DEFAULT_MODEL,
  messages: [{ role: 'user', content }],
  ...extra,
});

export const bearer = (raw: string) => ({ Authorization: `Bearer ${raw}` });

/**
 * Removes everything the suite created. Both `ledger_entries` and `ai_requests` RESTRICT their foreign
 * key, so the ledger (which can point at a request) goes first, then requests, then what they point to.
 */
export async function destroyTestContext(context: TestContext): Promise<void> {
  const { prisma } = context;
  await resetTrafficState(context);
  await prisma.ledgerEntry.deleteMany({ where: { tenantId: { in: context.tenantIds } } });
  await prisma.aiRequest.deleteMany({ where: { tenantId: { in: context.tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: context.tenantIds } } });
  await prisma.aiModel.deleteMany({ where: { id: { in: context.modelIds } } });
  await prisma.aiProvider.deleteMany({ where: { id: { in: context.providerIds } } });
  for (const snapshot of context.providerSnapshots) {
    await prisma.aiProvider.update({
      where: { id: snapshot.id },
      data: { status: snapshot.status, configuration: snapshot.configuration },
    });
  }
  await context.app.close();
  await Promise.all(Object.values(context.fakes).map((fake) => fake.close()));
}
