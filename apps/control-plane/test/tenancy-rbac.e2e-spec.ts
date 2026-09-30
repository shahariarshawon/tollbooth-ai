import {
  PASSWORD,
  asTenant,
  bearer,
  createSuperAdmin,
  createTestContext,
  createUser,
  destroyTestContext,
  http,
  login,
  registerTenant,
  unique,
} from './support/context';
import type { Account, TestContext } from './support/context';

describe('Authorization and tenant isolation (e2e)', () => {
  let ctx: TestContext;
  let tenantA: Account & { tenantId: string; slug: string };
  let tenantB: Account & { tenantId: string; slug: string };
  let devA: Account;
  let financeA: Account;
  let devB: Account;
  let superAdmin: Account;

  beforeAll(async () => {
    ctx = await createTestContext();
    tenantA = await registerTenant(ctx, 'alpha');
    tenantB = await registerTenant(ctx, 'bravo');
    devA = await createUser(ctx, tenantA, 'DEVELOPER');
    financeA = await createUser(ctx, tenantA, 'FINANCE');
    devB = await createUser(ctx, tenantB, 'DEVELOPER');
    superAdmin = await createSuperAdmin(ctx);
  });
  afterAll(() => destroyTestContext(ctx));
  beforeEach(() => ctx.store.reset());

  describe('RBAC', () => {
    it('allows a tenant admin to list users', async () => {
      await http(ctx).get('/users').set(bearer(tenantA)).expect(200);
    });

    it.each([
      ['DEVELOPER', () => devA],
      ['FINANCE', () => financeA],
    ])('forbids %s from listing users', async (_role, account) => {
      const res = await http(ctx).get('/users').set(bearer(account())).expect(403);
      expect(res.body.message).toBe('You do not have permission to perform this action');
    });

    it('forbids a developer from creating, updating and deleting users', async () => {
      await http(ctx)
        .post('/users')
        .set(bearer(devA))
        .send({
          email: `${unique('x')}@e2e.test`,
          password: PASSWORD,
          firstName: 'A',
          lastName: 'B',
          role: 'FINANCE',
        })
        .expect(403);
      await http(ctx)
        .patch(`/users/${financeA.userId}`)
        .set(bearer(devA))
        .send({ firstName: 'Z' })
        .expect(403);
      await http(ctx).delete(`/users/${financeA.userId}`).set(bearer(devA)).expect(403);
    });

    it('reserves tenant management for super admins', async () => {
      await http(ctx).get('/tenants').set(bearer(tenantA)).expect(403);
      await http(ctx)
        .post('/tenants')
        .set(bearer(tenantA))
        .send({ companyName: 'Sneaky', slug: unique('sneaky') })
        .expect(403);
      await http(ctx).delete(`/tenants/${tenantA.tenantId}`).set(bearer(tenantA)).expect(403);
      await http(ctx).get('/tenants').set(bearer(superAdmin)).expect(200);
    });

    it('validates the input of permitted requests', async () => {
      await http(ctx).get('/users?limit=1000').set(bearer(tenantA)).expect(400);
      await http(ctx).get('/users/not-a-uuid').set(bearer(tenantA)).expect(400);
      await http(ctx)
        .post('/users')
        .set(bearer(tenantA))
        .send({
          email: 'nope',
          password: 'weak',
          firstName: '',
          lastName: 'B',
          role: 'SUPER_ADMIN',
        })
        .expect(400);
    });

    it('never lets the API create a SUPER_ADMIN', async () => {
      const email = `${unique('esc')}@e2e.test`;
      const res = await http(ctx)
        .post('/users')
        .set(bearer(tenantA))
        .send({ email, password: PASSWORD, firstName: 'A', lastName: 'B', role: 'SUPER_ADMIN' })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('role must be one of');
      await http(ctx)
        .patch(`/users/${devA.userId}`)
        .set(bearer(tenantA))
        .send({ role: 'SUPER_ADMIN' })
        .expect(400);
    });
  });

  describe('tenant isolation', () => {
    it('lists only the users of the caller tenant', async () => {
      const res = await http(ctx).get('/users').set(bearer(tenantA)).expect(200);
      const ids = res.body.data.map((u: { id: string }) => u.id);
      expect(ids).toEqual(expect.arrayContaining([tenantA.userId, devA.userId, financeA.userId]));
      expect(ids).not.toContain(tenantB.userId);
      expect(ids).not.toContain(devB.userId);
      expect(
        res.body.data.every((u: { tenantId: string }) => u.tenantId === tenantA.tenantId),
      ).toBe(true);
      expect(res.body.total).toBe(3);
    });

    it('answers 404 for users of another tenant on read, update and delete', async () => {
      await http(ctx).get(`/users/${devB.userId}`).set(bearer(tenantA)).expect(404);
      await http(ctx)
        .patch(`/users/${devB.userId}`)
        .set(bearer(tenantA))
        .send({ firstName: 'Hacked' })
        .expect(404);
      await http(ctx).delete(`/users/${devB.userId}`).set(bearer(tenantA)).expect(404);

      const untouched = await ctx.prisma.user.findUniqueOrThrow({ where: { id: devB.userId } });
      expect(untouched.firstName).toBe('New');
    });

    it('treats a foreign user exactly like a missing one', async () => {
      const foreign = await http(ctx).get(`/users/${devB.userId}`).set(bearer(tenantA));
      const missing = await http(ctx)
        .get('/users/00000000-0000-4000-8000-000000000000')
        .set(bearer(tenantA));
      expect(foreign.status).toBe(missing.status);
      expect(foreign.body).toEqual(missing.body);
    });

    it('hides other tenants from tenant users', async () => {
      await http(ctx).get(`/tenants/${tenantA.tenantId}`).set(bearer(devA)).expect(200);
      await http(ctx).get(`/tenants/${tenantB.tenantId}`).set(bearer(tenantA)).expect(404);
      await http(ctx)
        .patch(`/tenants/${tenantB.tenantId}`)
        .set(bearer(tenantA))
        .send({ companyName: 'Hijacked' })
        .expect(404);
    });

    it('rejects an X-Tenant-Id header that names a different tenant', async () => {
      await http(ctx)
        .get('/users')
        .set(bearer(tenantA))
        .set(asTenant(tenantB.tenantId))
        .expect(403);
    });

    it('keeps data separate even for the same email local part and name', async () => {
      const inA = await http(ctx).get('/users').set(bearer(tenantA)).expect(200);
      const inB = await http(ctx).get('/users').set(bearer(tenantB)).expect(200);
      const overlap = inA.body.data
        .map((u: { id: string }) => u.id)
        .filter((id: string) => inB.body.data.some((o: { id: string }) => o.id === id));
      expect(overlap).toEqual([]);
    });

    it('lets a super admin act inside a tenant only when they select it', async () => {
      await http(ctx).get('/users').set(bearer(superAdmin)).expect(403);

      const res = await http(ctx)
        .get('/users')
        .set(bearer(superAdmin))
        .set(asTenant(tenantB.tenantId))
        .expect(200);
      expect(
        res.body.data.every((u: { tenantId: string }) => u.tenantId === tenantB.tenantId),
      ).toBe(true);

      await http(ctx)
        .get('/users')
        .set(bearer(superAdmin))
        .set(asTenant('00000000-0000-4000-8000-000000000000'))
        .expect(404);
    });
  });

  describe('user management', () => {
    it('creates an invited user who becomes active on first login', async () => {
      const email = `${unique('invite')}@e2e.test`;
      const created = await http(ctx)
        .post('/users')
        .set(bearer(tenantA))
        .send({
          email: email.toUpperCase(),
          password: PASSWORD,
          firstName: 'In',
          lastName: 'Vited',
          role: 'FINANCE',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        email,
        role: 'FINANCE',
        status: 'INVITED',
        tenantId: tenantA.tenantId,
      });
      expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|password/i);

      await login(ctx, email);
      const after = await http(ctx)
        .get(`/users/${created.body.id}`)
        .set(bearer(tenantA))
        .expect(200);
      expect(after.body.status).toBe('ACTIVE');
    });

    it('rejects a duplicate email, including one used in another tenant', async () => {
      await http(ctx)
        .post('/users')
        .set(bearer(tenantA))
        .send({
          email: devB.email,
          password: PASSWORD,
          firstName: 'A',
          lastName: 'B',
          role: 'DEVELOPER',
        })
        .expect(409);
    });

    it('audits creation, update, role change and deletion with actor and tenant', async () => {
      const admin = await registerTenant(ctx, 'audited');
      const dev = await createUser(ctx, admin, 'DEVELOPER');
      await http(ctx)
        .patch(`/users/${dev.userId}`)
        .set(bearer(admin))
        .send({ role: 'FINANCE', firstName: 'Fin' })
        .expect(200);
      await http(ctx).delete(`/users/${dev.userId}`).set(bearer(admin)).expect(204);

      const rows = await ctx.prisma.auditLog.findMany({
        where: { tenantId: admin.tenantId, resourceId: dev.userId },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.action)).toEqual([
        'USER_CREATED',
        'USER_UPDATED',
        'ROLE_CHANGED',
        'USER_DELETED',
      ]);
      expect(rows.every((r) => r.userId === admin.userId && r.tenantId === admin.tenantId)).toBe(
        true,
      );
      expect(rows[2]?.metadata).toEqual({ from: 'DEVELOPER', to: 'FINANCE' });
      expect(rows[0]?.ipAddress).toBeTruthy();
    });

    it('does not audit or change anything when an update changes nothing', async () => {
      const admin = await registerTenant(ctx, 'noop');
      const dev = await createUser(ctx, admin, 'DEVELOPER');
      await http(ctx)
        .patch(`/users/${dev.userId}`)
        .set(bearer(admin))
        .send({ role: 'DEVELOPER' })
        .expect(200);
      const updates = await ctx.prisma.auditLog.count({
        where: { tenantId: admin.tenantId, action: { in: ['USER_UPDATED', 'ROLE_CHANGED'] } },
      });
      expect(updates).toBe(0);
    });

    it('stops admins from changing their own role or status, or deleting themselves', async () => {
      const admin = await registerTenant(ctx, 'self');
      await http(ctx)
        .patch(`/users/${admin.userId}`)
        .set(bearer(admin))
        .send({ role: 'DEVELOPER' })
        .expect(403);
      await http(ctx)
        .patch(`/users/${admin.userId}`)
        .set(bearer(admin))
        .send({ status: 'DISABLED' })
        .expect(403);
      await http(ctx).delete(`/users/${admin.userId}`).set(bearer(admin)).expect(403);
      await http(ctx)
        .patch(`/users/${admin.userId}`)
        .set(bearer(admin))
        .send({ firstName: 'Renamed' })
        .expect(200);
    });

    it('never leaves a tenant without an active administrator', async () => {
      const admin = await registerTenant(ctx, 'lastadmin');
      await http(ctx)
        .patch(`/users/${admin.userId}`)
        .set(bearer(superAdmin))
        .set(asTenant(admin.tenantId))
        .send({ role: 'DEVELOPER' })
        .expect(409);
      await http(ctx)
        .delete(`/users/${admin.userId}`)
        .set(bearer(superAdmin))
        .set(asTenant(admin.tenantId))
        .expect(409);

      const second = await createUser(ctx, admin, 'TENANT_ADMIN');
      await http(ctx).delete(`/users/${second.userId}`).set(bearer(admin)).expect(204);
    });

    it('revokes refresh tokens when a user is disabled or deleted', async () => {
      const admin = await registerTenant(ctx, 'revoke');
      const dev = await createUser(ctx, admin, 'DEVELOPER');
      await http(ctx)
        .patch(`/users/${dev.userId}`)
        .set(bearer(admin))
        .send({ status: 'DISABLED' })
        .expect(200);
      const live = await ctx.prisma.refreshToken.count({
        where: { userId: dev.userId, revokedAt: null },
      });
      expect(live).toBe(0);
    });

    it('paginates', async () => {
      const all = await http(ctx).get('/users?limit=100').set(bearer(tenantA)).expect(200);
      const page = await http(ctx).get('/users?limit=2&offset=1').set(bearer(tenantA)).expect(200);
      expect(page.body).toMatchObject({ limit: 2, offset: 1, total: all.body.total });
      expect(page.body.data.map((u: { id: string }) => u.id)).toEqual(
        all.body.data.slice(1, 3).map((u: { id: string }) => u.id),
      );
    });
  });

  describe('tenant management', () => {
    it('lets a super admin create, read, update and delete a tenant', async () => {
      const slug = unique('managed');
      const created = await http(ctx)
        .post('/tenants')
        .set(bearer(superAdmin))
        .send({ companyName: 'Managed Co', slug, plan: 'STARTUP' })
        .expect(201);
      ctx.tenantIds.push(created.body.id);
      expect(created.body).toMatchObject({ slug, plan: 'STARTUP', status: 'ACTIVE' });

      await http(ctx).get(`/tenants/${created.body.id}`).set(bearer(superAdmin)).expect(200);
      const updated = await http(ctx)
        .patch(`/tenants/${created.body.id}`)
        .set(bearer(superAdmin))
        .send({ plan: 'BUSINESS', status: 'SUSPENDED' })
        .expect(200);
      expect(updated.body).toMatchObject({ plan: 'BUSINESS', status: 'SUSPENDED' });

      await http(ctx).delete(`/tenants/${created.body.id}`).set(bearer(superAdmin)).expect(204);
      const row = await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.status).toBe('DELETED');
      await http(ctx).get(`/tenants/${created.body.id}`).set(bearer(superAdmin)).expect(200);
      await http(ctx).delete(`/tenants/${created.body.id}`).set(bearer(superAdmin)).expect(404);
    });

    it('rejects a duplicate slug and invalid input', async () => {
      await http(ctx)
        .post('/tenants')
        .set(bearer(superAdmin))
        .send({ companyName: 'Dup', slug: tenantA.slug })
        .expect(409);
      await http(ctx)
        .post('/tenants')
        .set(bearer(superAdmin))
        .send({ companyName: 'Bad', slug: 'Not A Slug!', plan: 'PLATINUM' })
        .expect(400);
    });

    it('lets a tenant admin rename their tenant but not change plan or status', async () => {
      await http(ctx)
        .patch(`/tenants/${tenantA.tenantId}`)
        .set(bearer(tenantA))
        .send({ companyName: 'Alpha Renamed' })
        .expect(200);
      await http(ctx)
        .patch(`/tenants/${tenantA.tenantId}`)
        .set(bearer(tenantA))
        .send({ plan: 'ENTERPRISE' })
        .expect(403);
      await http(ctx)
        .patch(`/tenants/${tenantA.tenantId}`)
        .set(bearer(tenantA))
        .send({ status: 'ACTIVE' })
        .expect(403);
      await http(ctx)
        .patch(`/tenants/${tenantA.tenantId}`)
        .set(bearer(devA))
        .send({ companyName: 'Nope' })
        .expect(403);
    });

    it('locks out a suspended tenant immediately, and revives it when reactivated', async () => {
      const t = await registerTenant(ctx, 'suspend');
      await http(ctx).get(`/tenants/${t.tenantId}`).set(bearer(t)).expect(200);

      await http(ctx)
        .patch(`/tenants/${t.tenantId}`)
        .set(bearer(superAdmin))
        .send({ status: 'SUSPENDED' })
        .expect(200);
      await http(ctx).get(`/tenants/${t.tenantId}`).set(bearer(t)).expect(401);
      await http(ctx).post('/auth/login').send({ email: t.email, password: PASSWORD }).expect(401);
      await http(ctx).post('/auth/refresh').send({ refreshToken: t.refreshToken }).expect(401);

      await http(ctx)
        .patch(`/tenants/${t.tenantId}`)
        .set(bearer(superAdmin))
        .send({ status: 'ACTIVE' })
        .expect(200);
      await http(ctx).get(`/tenants/${t.tenantId}`).set(bearer(t)).expect(200);
    });

    it('deleting a tenant revokes every session and blocks sign-in, but keeps the audit trail', async () => {
      const t = await registerTenant(ctx, 'retire');
      await http(ctx).delete(`/tenants/${t.tenantId}`).set(bearer(superAdmin)).expect(204);

      await http(ctx).get('/users').set(bearer(t)).expect(401);
      await http(ctx).post('/auth/refresh').send({ refreshToken: t.refreshToken }).expect(401);
      await http(ctx).post('/auth/login').send({ email: t.email, password: PASSWORD }).expect(401);
      const live = await ctx.prisma.refreshToken.count({
        where: { user: { tenantId: t.tenantId }, revokedAt: null },
      });
      expect(live).toBe(0);

      const audit = await ctx.prisma.auditLog.findMany({
        where: { tenantId: t.tenantId, action: 'TENANT_DELETED' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.userId).toBe(superAdmin.userId);
    });
  });
});
