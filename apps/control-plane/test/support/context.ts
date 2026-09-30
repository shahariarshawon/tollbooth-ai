import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@tollbooth/database';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { InMemoryRateLimitStore } from '../../src/common/rate-limit/in-memory-rate-limit.store';
import { RATE_LIMIT_STORE } from '../../src/common/rate-limit/rate-limit.store';

export const PASSWORD = 'Sup3rSecret';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  jwt: JwtService;
  store: InMemoryRateLimitStore;
  tenantIds: string[];
  userIds: string[];
}

export interface Account {
  userId: string;
  tenantId: string | null;
  email: string;
  accessToken: string;
  refreshToken: string;
}

/** Boots the real application against the real database. Only Redis is replaced by an in-memory store. */
export async function createTestContext(): Promise<TestContext> {
  const store = new InMemoryRateLimitStore();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RATE_LIMIT_STORE)
    .useValue(store)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    jwt: app.get(JwtService),
    store,
    tenantIds: [],
    userIds: [],
  };
}

export function http(ctx: TestContext) {
  return request(ctx.app.getHttpServer());
}

export const unique = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

export async function login(
  ctx: TestContext,
  email: string,
  password: string = PASSWORD,
): Promise<Account> {
  const res = await http(ctx).post('/auth/login').send({ email, password }).expect(200);
  return {
    userId: res.body.user.id,
    tenantId: res.body.user.tenantId,
    email,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/** Self-service sign-up followed by login. Returns the new tenant admin. */
export async function registerTenant(
  ctx: TestContext,
  label: string,
): Promise<Account & { tenantId: string; slug: string }> {
  const slug = unique(label);
  const email = `admin-${slug}@e2e.test`;
  const res = await http(ctx)
    .post('/auth/register')
    .send({
      email,
      password: PASSWORD,
      firstName: 'Test',
      lastName: 'Admin',
      companyName: `${label} Inc`,
      tenantSlug: slug,
    })
    .expect(201);
  ctx.tenantIds.push(res.body.tenant.id);
  const account = await login(ctx, email);
  return { ...account, tenantId: res.body.tenant.id as string, slug };
}

/** Creates a user through the API as `admin` and returns them logged in. */
export async function createUser(
  ctx: TestContext,
  admin: Account,
  role: 'TENANT_ADMIN' | 'DEVELOPER' | 'FINANCE',
): Promise<Account> {
  const email = `${role.toLowerCase()}-${unique('u')}@e2e.test`;
  await http(ctx)
    .post('/users')
    .set(bearer(admin))
    .send({ email, password: PASSWORD, firstName: 'New', lastName: role, role })
    .expect(201);
  return login(ctx, email);
}

export async function createSuperAdmin(ctx: TestContext): Promise<Account> {
  const email = `super-${unique('s')}@e2e.test`;
  const user = await ctx.prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });
  ctx.userIds.push(user.id);
  return login(ctx, email);
}

export const bearer = (account: Pick<Account, 'accessToken'>) => ({
  Authorization: `Bearer ${account.accessToken}`,
});

export const asTenant = (tenantId: string) => ({ 'X-Tenant-Id': tenantId });

/** Removes everything the suite created. Audit rows are RESTRICTed by design, so they go first. */
export async function destroyTestContext(ctx: TestContext): Promise<void> {
  const { prisma } = ctx;
  await prisma.auditLog.deleteMany({
    where: { OR: [{ tenantId: { in: ctx.tenantIds } }, { userId: { in: ctx.userIds } }] },
  });
  await prisma.$executeRaw`DELETE FROM audit_logs WHERE "tenantId" IS NULL AND metadata->>'email' LIKE '%@e2e.test'`;
  await prisma.tenant.deleteMany({ where: { id: { in: ctx.tenantIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ctx.userIds } } });
  await ctx.app.close();
}
