import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@tollbooth/database';
import type { ApiKeyStatus } from '@tollbooth/database';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiKeyService } from '../../src/api-key/api-key.service';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { startFakeOpenAi } from './fake-openai';
import type { FakeOpenAi } from './fake-openai';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  fake: FakeOpenAi;
  tenantIds: string[];
  modelIds: string[];
  providerIds: string[];
}

export interface Fixture {
  tenantId: string;
  projectId: string;
  /** A key that may call chat completions. */
  key: { id: string; raw: string };
}

/** Boots the real gateway against the real database, with OpenAI replaced by a local fake. */
export async function createTestContext(): Promise<TestContext> {
  const fake = await startFakeOpenAi();
  // Read by the config module when the application is created below.
  process.env['OPENAI_BASE_URL'] = fake.url;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const context: TestContext = { app, prisma, fake, tenantIds: [], modelIds: [], providerIds: [] };
  await ensureCatalogue(context);
  return context;
}

export function http(context: TestContext) {
  return request(context.app.getHttpServer());
}

const unique = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

/** The models the tests rely on. Upserts, so they coexist with the development seed. */
async function ensureCatalogue(context: TestContext): Promise<void> {
  const { prisma } = context;
  const openai = await prisma.aiProvider.upsert({
    where: { name: 'OpenAI' },
    update: {},
    create: { name: 'OpenAI', type: 'OPENAI' },
  });
  const anthropic = await prisma.aiProvider.upsert({
    where: { name: 'Anthropic' },
    update: {},
    create: { name: 'Anthropic', type: 'ANTHROPIC' },
  });
  for (const [providerId, modelName] of [
    [openai.id, 'gpt-4'],
    [openai.id, 'gpt-4o-mini'],
    [anthropic.id, 'claude-sonnet-4-5'],
  ] as const) {
    await prisma.aiModel.upsert({
      where: { providerId_modelName: { providerId, modelName } },
      update: { isActive: true },
      create: { providerId, modelName, inputTokenPrice: '1.00', outputTokenPrice: '2.00' },
    });
  }
  // These two exist only for the duration of the suite.
  // An upsert, so a run that was interrupted before cleanup cannot break the next one.
  const inactive = await prisma.aiModel.upsert({
    where: { providerId_modelName: { providerId: openai.id, modelName: 'e2e-inactive-model' } },
    update: { isActive: false },
    create: {
      providerId: openai.id,
      modelName: 'e2e-inactive-model',
      inputTokenPrice: '1.00',
      outputTokenPrice: '2.00',
      isActive: false,
    },
  });
  const disabledProvider = await prisma.aiProvider.create({
    data: { name: unique('E2E Disabled Provider'), type: 'OPENAI', status: 'DISABLED' },
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

export async function createFixture(context: TestContext): Promise<Fixture> {
  const slug = unique('gw');
  const tenant = await context.prisma.tenant.create({
    data: { companyName: `Gateway Test ${slug}`, slug },
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
  overrides: { permissions?: string[]; status?: ApiKeyStatus; expiresAt?: Date | null } = {},
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
    },
  });
  return { id: row.id, raw };
}

export const chat = (content = 'Hello', extra: Record<string, unknown> = {}) => ({
  model: 'gpt-4',
  messages: [{ role: 'user', content }],
  ...extra,
});

export const bearer = (raw: string) => ({ Authorization: `Bearer ${raw}` });

/** Removes everything the suite created. Request records are RESTRICTed by design, so they go first. */
export async function destroyTestContext(context: TestContext): Promise<void> {
  const { prisma } = context;
  await prisma.aiRequest.deleteMany({ where: { tenantId: { in: context.tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: context.tenantIds } } });
  await prisma.aiModel.deleteMany({ where: { id: { in: context.modelIds } } });
  await prisma.aiProvider.deleteMany({ where: { id: { in: context.providerIds } } });
  await context.app.close();
  await context.fake.close();
}
