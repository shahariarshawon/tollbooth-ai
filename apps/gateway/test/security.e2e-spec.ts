import {
  bearer,
  chat,
  createFixture,
  createTestContext,
  destroyTestContext,
  http,
  resetTrafficState,
} from './support/context';
import type { Fixture, TestContext } from './support/context';

/**
 * Phase 9, Task 6: the "AI Security Check" step between the budget check and the provider router. The
 * fake AI Security Service (fake-security.ts) defaults to `'ok'` — every other e2e file in this suite
 * never touches `ctx.security`, so this guard is a transparent pass-through for them. This file is the
 * one that exercises it actually blocking, and failing open or closed.
 */
describe('AI Security Check (e2e)', () => {
  describe('the default (fail closed)', () => {
    let ctx: TestContext;
    let fixture: Fixture;

    beforeAll(async () => {
      ctx = await createTestContext();
      fixture = await createFixture(ctx);
    });
    afterAll(async () => {
      if (ctx) await destroyTestContext(ctx);
    });
    beforeEach(async () => {
      ctx.fake.behavior = 'ok';
      ctx.fake.received.length = 0;
      ctx.security.behavior = 'ok';
      ctx.security.received.length = 0;
      await resetTrafficState(ctx);
    });

    const post = (body: unknown = chat()) =>
      http(ctx)
        .post('/v1/chat/completions')
        .set(bearer(fixture.key.raw))
        .send(body as object);

    it('sends the joined message text to the security service and lets a clean request through', async () => {
      await post(chat('Hello there')).expect(200);

      expect(ctx.security.received).toHaveLength(1);
      expect(ctx.security.received[0]?.body).toEqual({ text: 'Hello there' });
      expect(ctx.fake.received).toHaveLength(1); // it reached the provider
    });

    it('blocks the request with 400 content_policy_violation when the check blocks it, and never calls the provider', async () => {
      ctx.security.behavior = 'blocked';

      const res = await post().expect(400);

      expect(res.body.error).toMatchObject({
        type: 'invalid_request_error',
        code: 'content_policy_violation',
      });
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('does not record a blocked request in ai_requests: it never reached a provider', async () => {
      const before = await ctx.prisma.aiRequest.count({ where: { tenantId: fixture.tenantId } });
      ctx.security.behavior = 'blocked';
      await post().expect(400);

      const after = await ctx.prisma.aiRequest.count({ where: { tenantId: fixture.tenantId } });
      expect(after).toBe(before);
    });

    it('answers 503 security_service_unavailable when the service itself fails', async () => {
      ctx.security.behavior = 'server-error';

      const res = await post().expect(503);

      expect(res.body.error).toMatchObject({
        type: 'api_error',
        code: 'security_service_unavailable',
      });
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('answers 503 when the service does not respond in time', async () => {
      ctx.security.behavior = 'hang';

      const started = Date.now();
      const res = await post().expect(503);

      expect(Date.now() - started).toBeLessThan(5000);
      expect(res.body.error.code).toBe('security_service_unavailable');
    });

    it('still lets a request through unaffected on a model/budget error that happens first', async () => {
      // A request a plain validation error should already catch, before this guard would even see
      // meaningful content: the pipeline order (API key -> rate limit -> budget -> security) means a
      // request with no usable text never calls the security service in the first place (see the guard's
      // own tolerance for a body with no messages field), and DTO validation rejects it next.
      const res = await http(ctx)
        .post('/v1/chat/completions')
        .set(bearer(fixture.key.raw))
        .send({ model: 'gemini-2.0-flash' })
        .expect(400);

      expect(res.body.error.code).not.toBe('content_policy_violation');
      expect(ctx.security.received).toHaveLength(0);
    });
  });

  describe('failing open', () => {
    let ctx: TestContext;
    let fixture: Fixture;

    beforeAll(async () => {
      ctx = await createTestContext({ env: { GATEWAY_SECURITY_FAIL_OPEN: 'true' } });
      fixture = await createFixture(ctx);
    });
    afterAll(async () => {
      if (ctx) await destroyTestContext(ctx);
    });
    beforeEach(async () => {
      ctx.fake.behavior = 'ok';
      ctx.fake.received.length = 0;
      await resetTrafficState(ctx);
    });

    const post = (body: unknown = chat()) =>
      http(ctx)
        .post('/v1/chat/completions')
        .set(bearer(fixture.key.raw))
        .send(body as object);

    it('lets the request through unchecked when the security service is unreachable', async () => {
      ctx.security.behavior = 'server-error';

      await post().expect(200);

      expect(ctx.fake.received).toHaveLength(1);
    });

    it('still blocks the request when the service is reachable and actually blocks it', async () => {
      ctx.security.behavior = 'blocked';

      const res = await post().expect(400);

      expect(res.body.error.code).toBe('content_policy_violation');
    });
  });
});
