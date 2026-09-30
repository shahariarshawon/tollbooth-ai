import { ApiKeyService } from '../src/api-key/api-key.service';
import {
  bearer,
  chat,
  createFixture,
  createKey,
  createTestContext,
  destroyTestContext,
  http,
} from './support/context';
import type { Fixture, TestContext } from './support/context';

describe('API key authentication (e2e)', () => {
  let ctx: TestContext;
  let fixture: Fixture;

  beforeAll(async () => {
    ctx = await createTestContext();
    fixture = await createFixture(ctx);
  });
  afterAll(() => destroyTestContext(ctx));
  beforeEach(() => {
    ctx.fake.behavior = 'ok';
    ctx.fake.received.length = 0;
  });

  const call = (headers: Record<string, string>) =>
    http(ctx).post('/v1/chat/completions').set(headers).send(chat());

  it('accepts a valid key', async () => {
    await call(bearer(fixture.key.raw)).expect(200);
  });

  it('accepts the Bearer scheme in any letter case', async () => {
    await call({ Authorization: `bearer ${fixture.key.raw}` }).expect(200);
  });

  it('rejects a request with no key', async () => {
    const res = await http(ctx).post('/v1/chat/completions').send(chat()).expect(401);
    expect(res.body.error).toMatchObject({
      type: 'authentication_error',
      code: 'missing_api_key',
    });
  });

  it.each([
    ['garbage', 'Bearer not-a-key'],
    ['a different scheme', 'Basic dGI6a2V5'],
    ['a bare token with no scheme', 'tb_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['extra parts', 'Bearer tb_abcdefghijklmnopqrstuvwxyz0123456789 extra'],
    ['a well formed key that does not exist', 'Bearer tb_doesnotexist0123456789abcdefghijkl'],
    ['an OpenAI style key', 'Bearer sk-abcdefghijklmnopqrstuvwxyz0123456789'],
  ])('rejects %s with the standard invalid-key error', async (_label, header) => {
    const res = await call({ Authorization: header }).expect(401);
    expect(res.body).toEqual({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
        param: null,
        code: 'invalid_api_key',
      },
    });
  });

  it('never reaches the provider for a rejected key', async () => {
    await call({ Authorization: 'Bearer tb_doesnotexist0123456789abcdefghijkl' }).expect(401);
    expect(ctx.fake.received).toHaveLength(0);
  });

  it('rejects a revoked key exactly like an unknown one', async () => {
    const revoked = await createKey(ctx, fixture.tenantId, fixture.projectId, {
      status: 'REVOKED',
    });
    const res = await call(bearer(revoked.raw)).expect(401);
    expect(res.body.error.code).toBe('invalid_api_key');
  });

  it('rejects an expired key but accepts one that expires in the future', async () => {
    const expired = await createKey(ctx, fixture.tenantId, fixture.projectId, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await call(bearer(expired.raw)).expect(401);

    const future = await createKey(ctx, fixture.tenantId, fixture.projectId, {
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await call(bearer(future.raw)).expect(200);
  });

  it('identifies the tenant and project from the key, not from the request', async () => {
    const other = await createFixture(ctx);
    await http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(other.key.raw))
      // Attempts to name another tenant are not parameters the gateway knows, so they are refused.
      .send(chat('hi', { tenantId: fixture.tenantId }))
      .expect(400);

    await http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(other.key.raw))
      .send(chat('hi'))
      .expect(200);
    const records = await ctx.prisma.aiRequest.findMany({ where: { tenantId: other.tenantId } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ tenantId: other.tenantId, projectId: other.projectId });
    expect(
      await ctx.prisma.aiRequest.count({
        where: { tenantId: fixture.tenantId, apiKeyId: other.key.id },
      }),
    ).toBe(0);
  });

  it('refuses a key without the chat:completions permission', async () => {
    const limited = await createKey(ctx, fixture.tenantId, fixture.projectId, {
      permissions: ['models:read'],
    });
    const res = await call(bearer(limited.raw)).expect(403);
    expect(res.body.error).toMatchObject({
      type: 'permission_error',
      code: 'insufficient_permissions',
    });
    expect(ctx.fake.received).toHaveLength(0);
  });

  it('refuses a valid key whose tenant is suspended or whose project is archived', async () => {
    const suspended = await createFixture(ctx);
    await ctx.prisma.tenant.update({
      where: { id: suspended.tenantId },
      data: { status: 'SUSPENDED' },
    });
    const res = await call(bearer(suspended.key.raw)).expect(403);
    expect(res.body.error.code).toBe('account_inactive');

    const archived = await createFixture(ctx);
    await ctx.prisma.project.update({
      where: { id: archived.projectId },
      data: { status: 'ARCHIVED' },
    });
    await call(bearer(archived.key.raw)).expect(403);
  });

  it('stores only a hash, and matching is by hash', async () => {
    const row = await ctx.prisma.apiKey.findUniqueOrThrow({ where: { id: fixture.key.id } });
    expect(row.keyHash).toBe(ApiKeyService.hash(fixture.key.raw));
    expect(JSON.stringify(row)).not.toContain(fixture.key.raw);
  });

  it('records when a key was last used', async () => {
    const fresh = await createKey(ctx, fixture.tenantId, fixture.projectId);
    expect(
      (await ctx.prisma.apiKey.findUniqueOrThrow({ where: { id: fresh.id } })).lastUsedAt,
    ).toBeNull();
    await call(bearer(fresh.raw)).expect(200);
    // The write is deliberately off the request path, so give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(
      (await ctx.prisma.apiKey.findUniqueOrThrow({ where: { id: fresh.id } })).lastUsedAt,
    ).not.toBeNull();
  });

  it('keeps the health check open', async () => {
    await http(ctx).get('/health').expect(200);
  });
});
