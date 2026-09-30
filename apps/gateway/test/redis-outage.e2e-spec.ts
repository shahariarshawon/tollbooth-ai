import {
  bearer,
  chat,
  createFixture,
  createTestContext,
  destroyTestContext,
  http,
} from './support/context';
import type { Fixture, TestContext } from './support/context';

const DEAD_REDIS = { REDIS_HOST: '127.0.0.1', REDIS_PORT: '1' };

describe('Gateway when Redis is unreachable (e2e)', () => {
  describe('failing closed (the default)', () => {
    let ctx: TestContext;
    let fixture: Fixture;

    beforeAll(async () => {
      // Redis is down from the start: the gateway must still boot.
      ctx = await createTestContext({ env: DEAD_REDIS });
      fixture = await createFixture(ctx);
    }, 30_000);
    afterAll(async () => {
      if (ctx) await destroyTestContext(ctx);
    });
    beforeEach(() => ctx.fake.received.splice(0));

    it('starts, and its basic health check still answers', async () => {
      await http(ctx).get('/health').expect(200);
    });

    it('reports Redis as unhealthy, without revealing where it lives', async () => {
      const res = await http(ctx).get('/health/redis').expect(503);
      expect(res.body.status).toBe('unhealthy');
      expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|ECONNREFUSED/);
    });

    it('refuses AI requests with 503 because limits cannot be enforced, and never calls the provider', async () => {
      const res = await http(ctx)
        .post('/v1/chat/completions')
        .set(bearer(fixture.key.raw))
        .send(chat())
        .expect(503);

      expect(res.body.error).toMatchObject({
        type: 'api_error',
        code: 'traffic_control_unavailable',
      });
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('still rejects a bad API key first, since that check does not need Redis', async () => {
      const res = await http(ctx)
        .post('/v1/chat/completions')
        .set(bearer('tb_not_a_real_key_0123456789abcdef'))
        .send(chat())
        .expect(401);
      expect(res.body.error.code).toBe('invalid_api_key');
    });
  });

  describe('failing open (GATEWAY_FAIL_OPEN=true)', () => {
    let ctx: TestContext;
    let fixture: Fixture;

    beforeAll(async () => {
      ctx = await createTestContext({ env: { ...DEAD_REDIS, GATEWAY_FAIL_OPEN: 'true' } });
      fixture = await createFixture(ctx);
    }, 30_000);
    afterAll(async () => {
      if (ctx) await destroyTestContext(ctx);
    });

    it('serves requests without limits, and still records them', async () => {
      const res = await http(ctx)
        .post('/v1/chat/completions')
        .set(bearer(fixture.key.raw))
        .send(chat())
        .expect(200);

      expect(res.body.choices[0].message.content).toBe('Echo: Hello');
      // No counters exist, so there are no rate limit headers to report.
      expect(res.headers['x-ratelimit-limit-requests']).toBeUndefined();
      expect(await ctx.prisma.aiRequest.count({ where: { tenantId: fixture.tenantId } })).toBe(1);
    });

    it('serves many requests with no limit applied', async () => {
      for (let i = 0; i < 25; i++) {
        await http(ctx)
          .post('/v1/chat/completions')
          .set(bearer(fixture.key.raw))
          .send(chat())
          .expect(200);
      }
    });

    it('still reports Redis as unhealthy, so the outage is visible', async () => {
      await http(ctx).get('/health/redis').expect(503);
    });
  });
});
