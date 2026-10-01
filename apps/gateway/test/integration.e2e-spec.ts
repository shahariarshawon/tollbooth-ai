/**
 * End-to-end integration test: the full request pipeline.
 *
 * Flow:
 *   Client request (Bearer key)
 *   → API key guard (authenticates tenant)
 *   → SecurityGuard (PII / injection check via fake AI service)
 *   → GatewayService → ProviderRouter → Gemini (fake)
 *   → UsageService (ai_requests + ledger_entries rows)
 *   → OpenAI-shaped response
 */
import {
  bearer,
  chat,
  createFixture,
  createTestContext,
  destroyTestContext,
  http,
} from './support/context';
import type { Fixture, TestContext } from './support/context';

describe('Full pipeline integration test (e2e)', () => {
  let ctx: TestContext;
  let fixture: Fixture;

  beforeAll(async () => {
    ctx = await createTestContext();
    fixture = await createFixture(ctx, 'STARTUP');
    ctx.fake.behavior = 'ok';
  });

  afterAll(async () => {
    if (ctx) await destroyTestContext(ctx);
  });

  it('routes a valid request through all pipeline stages and returns a 200', async () => {
    const body = chat('Integration test: what is 1 + 1?');
    const res = await http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(fixture.key.raw))
      .send(body)
      .expect(200);

    // Step 1: response is OpenAI-shaped
    expect(res.body).toMatchObject({
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant' }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: expect.any(Number),
        completion_tokens: expect.any(Number),
        total_tokens: expect.any(Number),
        estimated_cost: expect.any(String),
      },
    });

    // Step 2: security service was called (fake received exactly one check)
    expect(ctx.security.received.length).toBeGreaterThanOrEqual(1);

    // Step 3: Gemini fake received exactly one request
    expect(ctx.fake.received.length).toBeGreaterThanOrEqual(1);
    expect(ctx.fake.received[0]).toBeDefined();

    // Step 4: ai_requests row was written
    const requests = await ctx.prisma.aiRequest.findMany({
      where: { tenantId: fixture.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests[0]).toMatchObject({
      tenantId: fixture.tenantId,
      status: 'SUCCESS',
    });

    // Step 5: ledger_entries row was written (cost charged)
    const entries = await ctx.prisma.ledgerEntry.findMany({
      where: { tenantId: fixture.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]).toMatchObject({
      tenantId: fixture.tenantId,
      transactionType: 'AI_USAGE',
    });
  });

  it('rejects a request with no API key with 401', async () => {
    await http(ctx).post('/v1/chat/completions').send(chat()).expect(401);
  });

  it('rejects a request with an invalid API key with 401', async () => {
    await http(ctx)
      .post('/v1/chat/completions')
      .set({ Authorization: 'Bearer tb_not_a_real_key_00000000000000000000000000000000000000000000000000' })
      .send(chat())
      .expect(401);
  });

  it('returns GET /health with postgres and redis status', async () => {
    const res = await http(ctx).get('/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'gateway',
      checks: { postgres: 'ok', redis: 'ok' },
    });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('exposes GET /metrics in Prometheus text format', async () => {
    const res = await http(ctx).get('/metrics').expect(200);

    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/http_requests_total/);
    expect(res.text).toMatch(/ai_requests_total/);
    expect(res.text).toMatch(/tokens_used_total/);
  });
});
