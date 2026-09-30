import { createHash } from 'node:crypto';
import {
  PASSWORD,
  bearer,
  createTestContext,
  createUser,
  destroyTestContext,
  http,
  login,
  registerTenant,
  unique,
} from './support/context';
import type { TestContext } from './support/context';

describe('Authentication (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => destroyTestContext(ctx));
  beforeEach(() => ctx.store.reset());

  describe('POST /auth/register', () => {
    it('creates a tenant and an active tenant admin, and never returns the password hash', async () => {
      const slug = unique('reg');
      const res = await http(ctx)
        .post('/auth/register')
        .send({
          email: `Owner-${slug}@E2E.test`,
          password: PASSWORD,
          firstName: 'Olive',
          lastName: 'Owner',
          companyName: 'Register Co',
          tenantSlug: slug,
        })
        .expect(201);
      ctx.tenantIds.push(res.body.tenant.id);

      expect(res.body.user).toMatchObject({
        email: `owner-${slug}@e2e.test`,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
        tenantId: res.body.tenant.id,
      });
      expect(res.body.tenant).toMatchObject({ slug, plan: 'FREE' });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    });

    it('stores a bcrypt hash, never the password', async () => {
      const admin = await registerTenant(ctx, 'hash');
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
      expect(row.passwordHash).not.toBe(PASSWORD);
      expect(row.passwordHash).not.toContain(PASSWORD);
      expect(row.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    });

    it('rejects weak passwords without echoing them', async () => {
      const res = await http(ctx)
        .post('/auth/register')
        .send({
          email: `${unique('weak')}@e2e.test`,
          password: 'weakpass',
          firstName: 'A',
          lastName: 'B',
          companyName: 'C',
          tenantSlug: unique('weak'),
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('password must be at least 8 characters');
      expect(JSON.stringify(res.body)).not.toContain('weakpass');
    });

    it('refuses mass assignment of role, status or tenant fields', async () => {
      const res = await http(ctx)
        .post('/auth/register')
        .send({
          email: `${unique('mass')}@e2e.test`,
          password: PASSWORD,
          firstName: 'A',
          lastName: 'B',
          companyName: 'C',
          tenantSlug: unique('mass'),
          role: 'SUPER_ADMIN',
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('role should not exist');
    });

    it('returns 409 for a duplicate email or slug', async () => {
      const first = await registerTenant(ctx, 'dup');
      const base = {
        password: PASSWORD,
        firstName: 'A',
        lastName: 'B',
        companyName: 'C',
      };
      await http(ctx)
        .post('/auth/register')
        .send({ ...base, email: first.email, tenantSlug: unique('dup') })
        .expect(409);
      await http(ctx)
        .post('/auth/register')
        .send({ ...base, email: `${unique('dup')}@e2e.test`, tenantSlug: first.slug })
        .expect(409);
    });

    it('does not leave a half-created tenant behind when the email is taken', async () => {
      const first = await registerTenant(ctx, 'atomic');
      const slug = unique('atomic');
      await http(ctx)
        .post('/auth/register')
        .send({
          email: first.email,
          password: PASSWORD,
          firstName: 'A',
          lastName: 'B',
          companyName: 'C',
          tenantSlug: slug,
        })
        .expect(409);
      await expect(ctx.prisma.tenant.findUnique({ where: { slug } })).resolves.toBeNull();
    });
  });

  describe('POST /auth/login', () => {
    it('returns tokens and user info, and the JWT carries userId, tenantId and role', async () => {
      const admin = await registerTenant(ctx, 'login');
      const res = await http(ctx)
        .post('/auth/login')
        .send({ email: admin.email, password: PASSWORD })
        .expect(200);

      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: admin.userId, email: admin.email, role: 'TENANT_ADMIN' },
      });
      expect(typeof res.body.refreshToken).toBe('string');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

      const claims = ctx.jwt.decode(res.body.accessToken);
      expect(claims).toMatchObject({
        userId: admin.userId,
        sub: admin.userId,
        tenantId: admin.tenantId,
        role: 'TENANT_ADMIN',
        iss: 'tollbooth-control-plane',
      });
      expect(claims.exp - claims.iat).toBe(900);
    });

    it('stores only a hash of the refresh token', async () => {
      const admin = await registerTenant(ctx, 'rthash');
      const digest = createHash('sha256').update(admin.refreshToken).digest('hex');
      const stored = await ctx.prisma.refreshToken.findUnique({ where: { tokenHash: digest } });
      expect(stored?.userId).toBe(admin.userId);
      const leaked = await ctx.prisma.refreshToken.findFirst({
        where: { tokenHash: admin.refreshToken },
      });
      expect(leaked).toBeNull();
    });

    it('fails with the same response for a wrong password and an unknown email', async () => {
      const admin = await registerTenant(ctx, 'fail');
      const wrongPassword = await http(ctx)
        .post('/auth/login')
        .send({ email: admin.email, password: 'Wrong-Password1' })
        .expect(401);
      const unknownEmail = await http(ctx)
        .post('/auth/login')
        .send({ email: `${unique('ghost')}@e2e.test`, password: PASSWORD })
        .expect(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.message).toBe('Invalid email or password');
    });

    it('audits successful and failed logins', async () => {
      const admin = await registerTenant(ctx, 'audit');
      await http(ctx)
        .post('/auth/login')
        .send({ email: admin.email, password: 'Wrong-Password1' })
        .expect(401);
      const ghost = `${unique('ghost')}@e2e.test`;
      await http(ctx).post('/auth/login').send({ email: ghost, password: PASSWORD }).expect(401);

      const rows = await ctx.prisma.auditLog.findMany({
        where: {
          OR: [{ tenantId: admin.tenantId }, { metadata: { path: ['email'], equals: ghost } }],
        },
      });
      const actions = rows.map((row) => row.action);
      expect(actions).toEqual(expect.arrayContaining(['LOGIN_SUCCESS', 'LOGIN_FAILED']));

      const knownFailure = rows.find((r) => r.action === 'LOGIN_FAILED' && r.tenantId);
      expect(knownFailure).toMatchObject({ userId: admin.userId, tenantId: admin.tenantId });
      expect(knownFailure?.metadata).toEqual({ reason: 'bad_password' });

      const unknownFailure = rows.find((r) => r.action === 'LOGIN_FAILED' && !r.tenantId);
      expect(unknownFailure).toMatchObject({ userId: null, tenantId: null });
      // Passwords must never be written to the audit log.
      expect(JSON.stringify(rows)).not.toContain(PASSWORD);
    });

    it('rate limits repeated attempts on one account', async () => {
      const email = `${unique('brute')}@e2e.test`;
      for (let i = 0; i < 5; i++) {
        await http(ctx)
          .post('/auth/login')
          .send({ email, password: 'Wrong-Password1' })
          .expect(401);
      }
      const res = await http(ctx)
        .post('/auth/login')
        .send({ email, password: 'Wrong-Password1' })
        .expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(res.body.message).toBe('Too many requests. Please try again later.');
    });

    it('locks out the right password too once the limit is hit', async () => {
      const admin = await registerTenant(ctx, 'lockout');
      ctx.store.reset();
      for (let i = 0; i < 5; i++) {
        await http(ctx)
          .post('/auth/login')
          .send({ email: admin.email, password: 'Wrong-Password1' })
          .expect(401);
      }
      await http(ctx)
        .post('/auth/login')
        .send({ email: admin.email, password: PASSWORD })
        .expect(429);
    });

    it('blocks disabled users', async () => {
      const admin = await registerTenant(ctx, 'blocked');
      const dev = await createUser(ctx, admin, 'DEVELOPER');
      await http(ctx)
        .patch(`/users/${dev.userId}`)
        .set(bearer(admin))
        .send({ status: 'DISABLED' })
        .expect(200);
      await http(ctx)
        .post('/auth/login')
        .send({ email: dev.email, password: PASSWORD })
        .expect(401);
    });
  });

  describe('access tokens', () => {
    it('rejects requests without a token, with garbage, and with a tampered token', async () => {
      const admin = await registerTenant(ctx, 'jwt');
      await http(ctx).get('/users').expect(401);
      await http(ctx).get('/users').set('Authorization', 'Bearer not.a.jwt').expect(401);
      const [header, , signature] = admin.accessToken.split('.');
      const forged = Buffer.from(
        JSON.stringify({ ...ctx.jwt.decode(admin.accessToken), role: 'SUPER_ADMIN' }),
      ).toString('base64url');
      await http(ctx)
        .get('/users')
        .set('Authorization', `Bearer ${header}.${forged}.${signature}`)
        .expect(401);
    });

    it('rejects a token signed with another secret and an unsigned (alg none) token', async () => {
      const admin = await registerTenant(ctx, 'jwt2');
      const claims = {
        sub: admin.userId,
        userId: admin.userId,
        tenantId: admin.tenantId,
        role: 'TENANT_ADMIN',
      };
      const foreign = await ctx.jwt.signAsync(claims, {
        secret: 'a-completely-different-secret-value-000',
      });
      await http(ctx).get('/users').set('Authorization', `Bearer ${foreign}`).expect(401);

      const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims, iss: 'tollbooth-control-plane', exp: 4102444800 })}.`;
      await http(ctx).get('/users').set('Authorization', `Bearer ${unsigned}`).expect(401);
    });

    it('rejects an expired token', async () => {
      const admin = await registerTenant(ctx, 'expired');
      const expired = await ctx.jwt.signAsync(
        { sub: admin.userId, userId: admin.userId, tenantId: admin.tenantId, role: 'TENANT_ADMIN' },
        { expiresIn: -10 },
      );
      await http(ctx).get('/users').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('rejects a correctly signed token whose tenant does not match the user', async () => {
      const a = await registerTenant(ctx, 'mismatch-a');
      const b = await registerTenant(ctx, 'mismatch-b');
      const forged = await ctx.jwt.signAsync({
        sub: a.userId,
        userId: a.userId,
        tenantId: b.tenantId,
        role: 'TENANT_ADMIN',
      });
      await http(ctx).get('/users').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('uses the role stored in the database, not the role claimed in the token', async () => {
      const admin = await registerTenant(ctx, 'roleclaim');
      const dev = await createUser(ctx, admin, 'DEVELOPER');
      const inflated = await ctx.jwt.signAsync({
        sub: dev.userId,
        userId: dev.userId,
        tenantId: dev.tenantId,
        role: 'TENANT_ADMIN',
      });
      await http(ctx).get('/users').set('Authorization', `Bearer ${inflated}`).expect(403);
    });

    it('stops working immediately when the user is disabled', async () => {
      const admin = await registerTenant(ctx, 'disable');
      const dev = await createUser(ctx, admin, 'DEVELOPER');
      await http(ctx)
        .get('/tenants/' + dev.tenantId)
        .set(bearer(dev))
        .expect(200);
      await http(ctx)
        .patch(`/users/${dev.userId}`)
        .set(bearer(admin))
        .send({ status: 'DISABLED' })
        .expect(200);
      await http(ctx)
        .get('/tenants/' + dev.tenantId)
        .set(bearer(dev))
        .expect(401);
    });
  });

  describe('refresh tokens', () => {
    it('rotates: returns a new token pair and invalidates the old refresh token', async () => {
      const admin = await registerTenant(ctx, 'rotate');
      const res = await http(ctx)
        .post('/auth/refresh')
        .send({ refreshToken: admin.refreshToken })
        .expect(200);
      expect(res.body.refreshToken).not.toBe(admin.refreshToken);
      await http(ctx)
        .get('/tenants/' + admin.tenantId)
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);

      await http(ctx).post('/auth/refresh').send({ refreshToken: admin.refreshToken }).expect(401);
    });

    it('treats reuse of a rotated token as theft and revokes the whole family', async () => {
      const admin = await registerTenant(ctx, 'reuse');
      const rotated = await http(ctx)
        .post('/auth/refresh')
        .send({ refreshToken: admin.refreshToken })
        .expect(200);

      // The attacker replays the old token...
      await http(ctx).post('/auth/refresh').send({ refreshToken: admin.refreshToken }).expect(401);
      // ...and the legitimate holder of the newest token is logged out too.
      await http(ctx)
        .post('/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);

      const events = await ctx.prisma.auditLog.findMany({
        where: { tenantId: admin.tenantId, action: 'TOKEN_REUSE_DETECTED' },
      });
      expect(events).toHaveLength(1);
    });

    it('does not let concurrent use of one token succeed twice', async () => {
      const admin = await registerTenant(ctx, 'race');
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          http(ctx).post('/auth/refresh').send({ refreshToken: admin.refreshToken }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    });

    it('rejects unknown, expired and malformed refresh tokens', async () => {
      const admin = await registerTenant(ctx, 'badrt');
      await http(ctx).post('/auth/refresh').send({ refreshToken: 'nope' }).expect(401);
      await http(ctx).post('/auth/refresh').send({}).expect(400);

      await ctx.prisma.refreshToken.updateMany({
        where: { userId: admin.userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http(ctx).post('/auth/refresh').send({ refreshToken: admin.refreshToken }).expect(401);
    });

    it('logout revokes the session', async () => {
      const admin = await registerTenant(ctx, 'logout');
      await http(ctx).post('/auth/logout').send({ refreshToken: admin.refreshToken }).expect(204);
      await http(ctx).post('/auth/refresh').send({ refreshToken: admin.refreshToken }).expect(401);
      // Logging out an unknown token is not an error and reveals nothing.
      await http(ctx).post('/auth/logout').send({ refreshToken: 'unknown' }).expect(204);
    });

    it('a disabled user cannot refresh', async () => {
      const admin = await registerTenant(ctx, 'rtdisabled');
      const dev = await createUser(ctx, admin, 'DEVELOPER');
      await http(ctx)
        .patch(`/users/${dev.userId}`)
        .set(bearer(admin))
        .send({ status: 'DISABLED' })
        .expect(200);
      await http(ctx).post('/auth/refresh').send({ refreshToken: dev.refreshToken }).expect(401);
    });

    it('a second login creates an independent session', async () => {
      const admin = await registerTenant(ctx, 'sessions');
      const second = await login(ctx, admin.email);
      await http(ctx).post('/auth/logout').send({ refreshToken: second.refreshToken }).expect(204);
      await http(ctx).post('/auth/refresh').send({ refreshToken: admin.refreshToken }).expect(200);
    });
  });

  describe('error responses', () => {
    it('uses a consistent shape and leaks no internals', async () => {
      const res = await http(ctx)
        .get('/users/not-a-uuid')
        .set('Authorization', 'Bearer x')
        .expect(401);
      expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'statusCode']);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|node_modules|at .*\(/i);
    });

    it('health stays public', async () => {
      await http(ctx).get('/health').expect(200);
    });
  });
});
