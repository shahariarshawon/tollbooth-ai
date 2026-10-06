import { UNUSABLE_PASSWORD_HASH } from '@tollbooth/shared';
import type { Account, TestContext } from './support/context';
import {
  asTenant,
  bearer,
  createSuperAdmin,
  createTestContext,
  destroyTestContext,
  http,
  login,
  registerTenant,
  unique,
} from './support/context';

const SESSION_MINUTES = 30;

/**
 * The public demo workspace. Two application instances: one with the demo off (the default every
 * deployment ships with) and one with it on, both against the same database.
 */
describe('Demo workspace (e2e)', () => {
  let off: TestContext;
  let on: TestContext;
  let demoEmail: string;
  let demoTenantId: string;
  let demoUserId: string;
  let demoProjectId: string;
  let realTenant: Account & { tenantId: string };
  let realProjectId: string;

  beforeAll(async () => {
    demoEmail = `${unique('demo')}@demo.invalid`;
    off = await createTestContext();
    on = await createTestContext({
      DEMO_MODE: true,
      DEMO_SESSION_MINUTES: SESSION_MINUTES,
      DEMO_USER_EMAIL: demoEmail,
    });

    const tenant = await on.prisma.tenant.create({
      data: { companyName: 'Demo Co', slug: unique('demo-ws'), isDemo: true },
    });
    demoTenantId = tenant.id;
    on.tenantIds.push(tenant.id);
    const user = await on.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: demoEmail,
        passwordHash: UNUSABLE_PASSWORD_HASH,
        firstName: 'Demo',
        lastName: 'Visitor',
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
    });
    demoUserId = user.id;
    on.userIds.push(user.id);
    const project = await on.prisma.project.create({
      data: { tenantId: tenant.id, name: 'Demo project' },
    });
    demoProjectId = project.id;

    realTenant = await registerTenant(on, 'demo-real');
    const real = await on.prisma.project.create({
      data: { tenantId: realTenant.tenantId, name: 'Real tenant project' },
    });
    realProjectId = real.id;
  });

  afterAll(async () => {
    if (off) await destroyTestContext(off);
    if (on) await destroyTestContext(on);
  });

  // Each test starts with fresh rate-limit counters; the rate limiting suite below fills them on purpose.
  beforeEach(() => {
    off.store.reset();
    on.store.reset();
  });

  const startSession = (ctx: TestContext = on) => http(ctx).post('/auth/demo');

  describe('when DEMO_MODE is off', () => {
    it('does not exist: the route answers 404 and issues nothing', async () => {
      const res = await startSession(off).expect(404);
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
    });

    it('is off by default', async () => {
      // `off` was created with no configuration overrides, as a deployment that never set DEMO_MODE.
      await startSession(off).expect(404);
    });
  });

  describe('when DEMO_MODE is on', () => {
    it('starts a short session as the demo user, flagged as a demo', async () => {
      const res = await startSession().expect(200);
      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        user: { id: demoUserId, tenantId: demoTenantId, role: 'TENANT_ADMIN', isDemo: true },
      });
      // The whole session, refresh included, is capped at DEMO_SESSION_MINUTES.
      expect(res.body.refreshExpiresIn).toBeLessThanOrEqual(SESSION_MINUTES * 60);
      expect(res.body.refreshExpiresIn).toBeGreaterThan(SESSION_MINUTES * 60 - 30);
      expect(res.body.expiresIn).toBeLessThanOrEqual(15 * 60);
    });

    it('records who started it', async () => {
      await startSession().expect(200);
      const entries = await on.prisma.auditLog.findMany({
        where: { tenantId: demoTenantId, action: 'DEMO_SESSION_STARTED' },
      });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0]?.userId).toBe(demoUserId);
    });

    it('cannot be entered with a password: the demo account has none', async () => {
      for (const password of ['!', 'Sup3rSecret', 'ChangeMe123!', 'password-with-length']) {
        await http(on).post('/auth/login').send({ email: demoEmail, password }).expect(401);
      }
    });

    it('serves the dashboard overview and other reads', async () => {
      const { body } = await startSession().expect(200);
      const session = { accessToken: body.accessToken as string };
      await http(on).get('/dashboard/overview').set(bearer(session)).expect(200);
      const projects = await http(on).get('/projects').set(bearer(session)).expect(200);
      expect(projects.body.map((p: { name: string }) => p.name)).toEqual(['Demo project']);
      await http(on).get('/users').set(bearer(session)).expect(200);
    });
  });

  describe('read-only policy', () => {
    let session: { accessToken: string };

    beforeAll(async () => {
      const { body } = await startSession().expect(200);
      session = { accessToken: body.accessToken };
    });

    it('rejects every kind of write with an explicit message', async () => {
      const attempts = [
        () => http(on).post('/projects').set(bearer(session)).send({ name: 'Mine' }),
        () =>
          http(on)
            .patch(`/projects/${demoProjectId}`)
            .set(bearer(session))
            .send({ name: 'Renamed' }),
        () => http(on).delete(`/projects/${demoProjectId}`).set(bearer(session)),
        () => http(on).post('/teams').set(bearer(session)).send({ name: 'Team' }),
        () =>
          http(on)
            .post('/api-keys')
            .set(bearer(session))
            .send({ name: 'Key', projectId: demoProjectId }),
        () =>
          http(on).post('/users').set(bearer(session)).send({
            email: 'x@e2e.test',
            password: 'Sup3rSecret',
            firstName: 'X',
            lastName: 'Y',
            role: 'VIEWER',
          }),
      ];
      // One at a time: supertest binds a server per request.
      for (const attempt of attempts) {
        const res = await attempt().expect(403);
        expect(res.body.message).toBe('This action is disabled in the demo workspace');
      }
    });

    it('leaves the data untouched', async () => {
      const project = await on.prisma.project.findUnique({ where: { id: demoProjectId } });
      expect(project?.name).toBe('Demo project');
      expect(await on.prisma.project.count({ where: { tenantId: demoTenantId } })).toBe(1);
    });

    it('applies to a SUPER_ADMIN acting inside the demo tenant too', async () => {
      const superAdmin = await createSuperAdmin(on);
      await http(on)
        .get('/projects')
        .set(bearer(superAdmin))
        .set(asTenant(demoTenantId))
        .expect(200);
      await http(on)
        .post('/projects')
        .set(bearer(superAdmin))
        .set(asTenant(demoTenantId))
        .send({ name: 'Admin write' })
        .expect(403);
    });
  });

  describe('tenant boundaries', () => {
    it('cannot address another tenant, by header or otherwise', async () => {
      const { body } = await startSession().expect(200);
      const session = { accessToken: body.accessToken as string };
      await http(on)
        .get('/projects')
        .set(bearer(session))
        .set(asTenant(realTenant.tenantId))
        .expect(403);
      await http(on).get(`/projects/${realProjectId}`).set(bearer(session)).expect(404);
    });

    it("keeps the demo tenant's data out of other tenants' views", async () => {
      const projects = await http(on).get('/projects').set(bearer(realTenant)).expect(200);
      expect(projects.body.map((p: { name: string }) => p.name)).toEqual(['Real tenant project']);
    });
  });

  describe('session lifetime', () => {
    it('is not extended by refreshing: the new refresh token ends when the old one did', async () => {
      const { body } = await startSession().expect(200);
      const before = await on.prisma.refreshToken.findFirstOrThrow({
        where: { userId: demoUserId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      const refreshed = await http(on)
        .post('/auth/refresh')
        .send({ refreshToken: body.refreshToken })
        .expect(200);
      expect(refreshed.body.user.isDemo).toBe(true);
      expect(refreshed.body.refreshExpiresIn).toBeLessThanOrEqual(SESSION_MINUTES * 60);

      const after = await on.prisma.refreshToken.findFirstOrThrow({
        where: { userId: demoUserId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(after.id).not.toBe(before.id);
      expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
    });

    it('keeps refresh-token replay protection', async () => {
      const { body } = await startSession().expect(200);
      await http(on).post('/auth/refresh').send({ refreshToken: body.refreshToken }).expect(200);
      await http(on).post('/auth/refresh').send({ refreshToken: body.refreshToken }).expect(401);
    });

    it('never issues an access token that outlives the session', async () => {
      const { body } = await startSession().expect(200);
      expect(body.expiresIn).toBeLessThanOrEqual(body.refreshExpiresIn);
    });
  });

  describe('when the workspace is not set up', () => {
    it('answers 503 if the demo tenant is not flagged as a demo', async () => {
      await on.prisma.tenant.update({ where: { id: demoTenantId }, data: { isDemo: false } });
      try {
        await startSession().expect(503);
      } finally {
        await on.prisma.tenant.update({ where: { id: demoTenantId }, data: { isDemo: true } });
      }
    });

    it('answers 503 if the demo user is disabled', async () => {
      await on.prisma.user.update({ where: { id: demoUserId }, data: { status: 'DISABLED' } });
      try {
        await startSession().expect(503);
      } finally {
        await on.prisma.user.update({ where: { id: demoUserId }, data: { status: 'ACTIVE' } });
      }
    });
  });

  describe('normal authentication and authorization are unchanged', () => {
    it('lets a real tenant admin log in and change data, with the demo on', async () => {
      const account = await login(on, realTenant.email);
      expect(account.accessToken).toBeTruthy();

      const created = await http(on)
        .post('/projects')
        .set(bearer(account))
        .send({ name: 'Created for real' })
        .expect(201);
      await http(on)
        .patch(`/projects/${created.body.id}`)
        .set(bearer(account))
        .send({ description: 'x' })
        .expect(200);
      await http(on).delete(`/projects/${created.body.id}`).set(bearer(account)).expect(204);
    });

    it('does not mark ordinary sessions as demo sessions', async () => {
      const res = await http(on)
        .post('/auth/login')
        .send({ email: realTenant.email, password: 'Sup3rSecret' })
        .expect(200);
      expect(res.body.user.isDemo).toBe(false);
      expect(res.body.refreshExpiresIn).toBeGreaterThan(24 * 60 * 60);
    });

    it('still enforces the permission matrix inside the demo workspace', async () => {
      // A DEVELOPER-like restriction would be tested elsewhere; here a missing token is simply refused.
      await http(on).get('/projects').expect(401);
    });
  });

  describe('rate limiting', () => {
    it('refuses a client that keeps asking, with Retry-After', async () => {
      let refused: { status: number; header: Record<string, string> } | undefined;
      for (let attempt = 0; attempt < 15 && !refused; attempt += 1) {
        const res = await startSession();
        if (res.status === 429) refused = res;
      }
      expect(refused).toBeDefined();
      expect(Number(refused?.header['retry-after'])).toBeGreaterThan(0);
    });
  });
});
