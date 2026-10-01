import { setLogSink } from '../src/common/logging/structured-logger';
import { RedisKeys } from '../src/redis/redis.constants';
import { FAKE_ANTHROPIC_API_KEY } from './support/fake-anthropic';
import {
  DEFAULT_MODEL,
  bearer,
  chat,
  createFixture,
  createTestContext,
  destroyTestContext,
  http,
  resetTrafficState,
  setProvider,
} from './support/context';
import type { Fixture, TestContext } from './support/context';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The state the suite assumes at the start of every test: only Gemini is on. */
async function onlyGemini(ctx: TestContext, tier: 'free' | 'paid' = 'paid') {
  await setProvider(ctx, 'OpenAI', { status: 'DISABLED' });
  await setProvider(ctx, 'Anthropic', { status: 'DISABLED' });
  await setProvider(ctx, 'Google Gemini', { status: 'ACTIVE', tier });
}

describe('AI provider abstraction (e2e)', () => {
  let ctx: TestContext;
  let fixture: Fixture;

  beforeAll(async () => {
    ctx = await createTestContext({
      circuit: { failureThreshold: 3, openMs: 800, successesToClose: 2, probeTimeoutMs: 5000 },
    });
    // STARTUP has limits roomy enough for the many calls in this file.
    fixture = await createFixture(ctx, 'STARTUP');
  });
  afterAll(async () => {
    if (ctx) await destroyTestContext(ctx);
  });
  beforeEach(async () => {
    ctx.fakes.gemini.behavior = 'ok';
    ctx.fakes.anthropic.behavior = 'ok';
    ctx.fakes.openai.behavior = 'ok';
    for (const fake of Object.values(ctx.fakes)) fake.received.length = 0;
    await onlyGemini(ctx);
    await resetTrafficState(ctx);
  });
  afterEach(() => setLogSink(null));

  const post = (body: unknown = chat(), key = fixture.key.raw) =>
    http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(key))
      .send(body as object);

  const lastRecord = () =>
    ctx.prisma.aiRequest.findFirstOrThrow({
      where: { tenantId: fixture.tenantId },
      orderBy: { createdAt: 'desc' },
    });

  describe('Gemini (active)', () => {
    it('turns a system message into systemInstruction and the assistant role into "model"', async () => {
      await post({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
          { role: 'user', content: 'Again' },
        ],
      }).expect(200);

      expect(ctx.fakes.gemini.received[0]?.body).toMatchObject({
        systemInstruction: { parts: [{ text: 'Be brief.' }] },
        contents: [
          { role: 'user', parts: [{ text: 'Hi' }] },
          { role: 'model', parts: [{ text: 'Hello' }] },
          { role: 'user', parts: [{ text: 'Again' }] },
        ],
      });
    });

    it('counts reasoning tokens as output, in the response and in the record', async () => {
      ctx.fakes.gemini.behavior = 'thinking';
      const res = await post().expect(200);

      expect(res.body.usage).toMatchObject({
        prompt_tokens: 11,
        completion_tokens: 37,
        total_tokens: 48,
      });
      expect(typeof res.body.usage.estimated_cost).toBe('string');
      expect(await lastRecord()).toMatchObject({
        provider: 'GOOGLE',
        requestTokens: 11,
        responseTokens: 37,
        totalTokens: 48,
      });
    });

    it('answers with null content and finish_reason content_filter when a safety filter stops the reply', async () => {
      ctx.fakes.gemini.behavior = 'safety-stop';
      const res = await post().expect(200);
      expect(res.body.choices[0]).toMatchObject({
        message: { role: 'assistant', content: null },
        finish_reason: 'content_filter',
      });
    });

    it('relays a blocked prompt as the caller own problem (400), records it, and keeps the circuit closed', async () => {
      ctx.fakes.gemini.behavior = 'blocked';
      for (let i = 0; i < 4; i++) {
        const res = await post().expect(400);
        expect(res.body.error).toMatchObject({ code: 'provider_rejected_request' });
        expect(res.body.error.message).toMatch(/blocked/i);
      }
      expect(await lastRecord()).toMatchObject({ status: 'FAILED', provider: 'GOOGLE' });
      expect(await ctx.redis.client.exists(RedisKeys.circuit('gemini'))).toBe(0);
    });

    it('treats a rejected API key (reported by Google as a 400) as our problem: 503, and no secret leaks', async () => {
      ctx.fakes.gemini.behavior = 'unauthorized';
      const res = await post().expect(503);

      expect(res.body.error.code).toBe('provider_unavailable');
      expect(JSON.stringify(res.body)).not.toMatch(/AIza|SECRETKEYFRAGMENT|API key/);
      const record = await lastRecord();
      expect(record.errorMessage).toBe('auth');
      expect(JSON.stringify(record)).not.toMatch(/SECRETKEYFRAGMENT|AIza/);
    });

    it('answers 503, not a caller error, when Gemini does not have a model that is in our catalogue', async () => {
      ctx.fakes.gemini.behavior = 'not-found';
      const res = await post().expect(503);
      expect(res.body.error.code).toBe('provider_unavailable');
      expect((await lastRecord()).errorMessage).toBe('unavailable');
    });

    it('reports a Gemini outage and rate limiting as 503, with a reason on the record', async () => {
      ctx.fakes.gemini.behavior = 'server-error';
      await post().expect(503);
      expect((await lastRecord()).errorMessage).toBe('unavailable');

      ctx.fakes.gemini.behavior = 'rate-limited';
      await post().expect(503);
      expect((await lastRecord()).errorMessage).toBe('rate_limited');
    });

    it('creates a PROVIDER_ERROR alert (Phase 11, Task 3) for a real provider failure', async () => {
      ctx.fakes.gemini.behavior = 'server-error';
      await post().expect(503);

      const alert = await ctx.prisma.alert.findFirst({
        where: { tenantId: fixture.tenantId, type: 'PROVIDER_ERROR' },
        orderBy: { createdAt: 'desc' },
      });
      expect(alert).toMatchObject({
        tenantId: fixture.tenantId,
        type: 'PROVIDER_ERROR',
        status: 'UNREAD',
      });
    });

    it('creates no alert for a bad_request: the caller erred, not the provider', async () => {
      const before = await ctx.prisma.alert.count({
        where: { tenantId: fixture.tenantId, type: 'PROVIDER_ERROR' },
      });
      ctx.fakes.gemini.behavior = 'blocked';
      await post().expect(400);

      const after = await ctx.prisma.alert.count({
        where: { tenantId: fixture.tenantId, type: 'PROVIDER_ERROR' },
      });
      expect(after).toBe(before);
    });

    it('gives up on a Gemini that never answers', async () => {
      ctx.fakes.gemini.behavior = 'hang';
      const started = Date.now();
      await post().expect(503);
      // A timeout is retried (GATEWAY_MAX_PROVIDER_RETRIES), so this is a few timeouts, not one.
      expect(Date.now() - started).toBeLessThan(8000);
      expect((await lastRecord()).errorMessage).toBe('timeout');
    });
  });

  describe('retry (GATEWAY_MAX_PROVIDER_RETRIES, 2 in tests: 3 attempts total)', () => {
    it('recovers transparently when a transient rate limit clears before retries run out', async () => {
      ctx.fakes.gemini.behavior = 'rate-limited';
      setTimeout(() => {
        ctx.fakes.gemini.behavior = 'ok';
      }, 50);

      await post().expect(200);

      expect(ctx.fakes.gemini.received).toHaveLength(2);
    });

    it('answers 503 once retries are exhausted against a provider still rate limiting', async () => {
      ctx.fakes.gemini.behavior = 'rate-limited';

      const res = await post().expect(503);

      expect(res.body.error.code).toBe('provider_unavailable');
      expect((await lastRecord()).errorMessage).toBe('rate_limited');
      expect(ctx.fakes.gemini.received).toHaveLength(3);
    });

    it('does not retry bad credentials: one call, straight to 503', async () => {
      ctx.fakes.gemini.behavior = 'unauthorized';

      await post().expect(503);

      expect(ctx.fakes.gemini.received).toHaveLength(1);
    });

    it('does not retry a request the provider itself rejected: one call, straight to 400', async () => {
      ctx.fakes.gemini.behavior = 'blocked';

      await post().expect(400);

      expect(ctx.fakes.gemini.received).toHaveLength(1);
    });

    it('does not retry an outage: the circuit breaker, not the retry loop, handles that', async () => {
      ctx.fakes.gemini.behavior = 'server-error';

      await post().expect(503);

      expect(ctx.fakes.gemini.received).toHaveLength(1);
    });
  });

  describe('cost tracking is provider independent and tier aware', () => {
    const budget = async () =>
      Object.fromEntries(
        Object.entries(
          await ctx.redis.client.hgetall(
            RedisKeys.budget(
              fixture.tenantId,
              new Date().toISOString().slice(0, 7).replace('-', ''),
            ),
          ),
        ).map(([key, value]) => [key, Number(value)]),
      );

    it('records a cost computed from the model prices in the database when the account is paid', async () => {
      const res = await post().expect(200);

      const record = await lastRecord();
      const prices = await ctx.prisma.aiModel.findFirstOrThrow({
        where: { modelName: DEFAULT_MODEL, provider: { type: 'GOOGLE' } },
      });
      const micro =
        Math.ceil(11 * Number(prices.inputTokenPrice)) +
        Math.ceil(7 * Number(prices.outputTokenPrice));
      expect(Number(record.estimatedCost)).toBeCloseTo(micro / 1_000_000, 8);
      expect((await budget())['currentUsage']).toBe(micro);
      // The same figure comes back to the caller, on the response (Phase 7, Task 10).
      expect(Number(res.body.usage.estimated_cost)).toBeCloseTo(micro / 1_000_000, 8);
    });

    it('records zero cost and spends no budget on a free tier, while still counting tokens', async () => {
      await setProvider(ctx, 'Google Gemini', { tier: 'free' });
      await post().expect(200);

      expect(Number((await lastRecord()).estimatedCost)).toBe(0);
      expect(await lastRecord()).toMatchObject({
        requestTokens: 11,
        responseTokens: 7,
        totalTokens: 18,
      });
      expect(await budget()).toMatchObject({ currentUsage: 0, reserved: 0 });
    });

    it('switches to charging as soon as the tier changes to paid, with no other change', async () => {
      await setProvider(ctx, 'Google Gemini', { tier: 'free' });
      await post().expect(200);
      expect(Number((await lastRecord()).estimatedCost)).toBe(0);

      await setProvider(ctx, 'Google Gemini', { tier: 'paid' });
      await post().expect(200);
      expect(Number((await lastRecord()).estimatedCost)).toBeGreaterThan(0);
    });

    it('records no cost for a failed call', async () => {
      ctx.fakes.gemini.behavior = 'server-error';
      await post().expect(503);
      expect(Number((await lastRecord()).estimatedCost)).toBe(0);
      expect((await budget())['currentUsage'] ?? 0).toBe(0);
    });
  });

  describe('usage ledger (Phase 7, Task 7)', () => {
    const lastLedgerEntry = () =>
      ctx.prisma.ledgerEntry.findFirstOrThrow({
        where: { tenantId: fixture.tenantId },
        orderBy: { createdAt: 'desc' },
      });

    it('writes an AI_USAGE entry linked to the request, charging the negative of its cost', async () => {
      await setProvider(ctx, 'Google Gemini', { tier: 'paid' });
      await post().expect(200);

      const record = await lastRecord();
      const entry = await lastLedgerEntry();
      expect(entry).toMatchObject({
        tenantId: fixture.tenantId,
        requestId: record.id,
        transactionType: 'AI_USAGE',
        currency: 'USD',
      });
      expect(Number(entry.amount)).toBeCloseTo(-Number(record.estimatedCost), 8);
      expect(Number(entry.amount)).toBeLessThan(0);
    });

    it('still writes a 0 entry on a free tier, so free usage has the same audit trail as paid usage', async () => {
      await setProvider(ctx, 'Google Gemini', { tier: 'free' });
      await post().expect(200);

      const entry = await lastLedgerEntry();
      expect(entry).toMatchObject({ transactionType: 'AI_USAGE' });
      expect(Number(entry.amount)).toBe(0);
    });

    it('writes no ledger entry for a failed call: nothing was spent', async () => {
      const before = await ctx.prisma.ledgerEntry.count({ where: { tenantId: fixture.tenantId } });
      ctx.fakes.gemini.behavior = 'server-error';
      await post().expect(503);

      expect(await ctx.prisma.ledgerEntry.count({ where: { tenantId: fixture.tenantId } })).toBe(
        before,
      );
    });
  });

  describe('OpenAI adapter (ready, switched off)', () => {
    it('is not used while its provider is disabled', async () => {
      const res = await post(chat('Hi', { model: 'gpt-4o-mini' })).expect(503);
      expect(res.body.error.code).toBe('provider_unavailable');
      expect(ctx.fakes.openai.received).toHaveLength(0);
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('serves its models once the provider is activated, through the same pipeline', async () => {
      await setProvider(ctx, 'OpenAI', { status: 'ACTIVE' });

      const res = await post(chat('Hello', { model: 'gpt-4o-mini' })).expect(200);

      expect(res.body.choices[0].message.content).toBe('Echo: Hello');
      expect(res.body.usage).toMatchObject({
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      });
      expect(typeof res.body.usage.estimated_cost).toBe('string');
      expect(ctx.fakes.openai.received).toHaveLength(1);
      expect(ctx.fakes.openai.received[0]?.headers.authorization).toBe(
        'Bearer sk-test-e2e-not-a-real-key',
      );
      expect(ctx.fake.received).toHaveLength(0);
      expect(await lastRecord()).toMatchObject({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        status: 'SUCCESS',
      });
    });

    it('refuses a conversation longer than the model accepts, without calling the provider', async () => {
      await setProvider(ctx, 'OpenAI', { status: 'ACTIVE' });

      const res = await post(chat('word '.repeat(12_000), { model: 'gpt-4' })).expect(400);

      expect(res.body.error).toMatchObject({ code: 'context_length_exceeded', param: 'messages' });
      expect(ctx.fakes.openai.received).toHaveLength(0);
    });
  });

  describe('Anthropic adapter (ready, switched off)', () => {
    it('is not used while its provider is disabled', async () => {
      await post(chat('Hi', { model: 'claude-sonnet-4-5' })).expect(503);
      expect(ctx.fakes.anthropic.received).toHaveLength(0);
    });

    it('serves its models once the provider is activated', async () => {
      await setProvider(ctx, 'Anthropic', { status: 'ACTIVE' });

      const res = await post({
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hello' },
        ],
        temperature: 1.5,
      }).expect(200);

      expect(res.body.choices[0]).toMatchObject({
        message: { role: 'assistant', content: 'Echo: Hello' },
        finish_reason: 'stop',
      });
      // The system message travels in its own field, so the provider sees one message.
      expect(res.body.usage).toMatchObject({
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      });
      expect(typeof res.body.usage.estimated_cost).toBe('string');

      const received = ctx.fakes.anthropic.received[0];
      expect(received?.headers['x-api-key']).toBe(FAKE_ANTHROPIC_API_KEY);
      expect(received?.headers['anthropic-version']).toBeDefined();
      expect(received?.body).toMatchObject({
        model: 'claude-sonnet-4-5',
        system: 'Be brief.',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
        temperature: 1,
      });
      expect(await lastRecord()).toMatchObject({ provider: 'ANTHROPIC', status: 'SUCCESS' });
    });

    it('classifies its errors like any other provider, without leaking', async () => {
      await setProvider(ctx, 'Anthropic', { status: 'ACTIVE' });
      const call = () => post(chat('Hi', { model: 'claude-sonnet-4-5' }));

      ctx.fakes.anthropic.behavior = 'unauthorized';
      const unauthorized = await call().expect(503);
      expect(JSON.stringify(unauthorized.body)).not.toMatch(/SECRETKEYFRAGMENT/);
      expect((await lastRecord()).errorMessage).toBe('auth');

      ctx.fakes.anthropic.behavior = 'rate-limited';
      await call().expect(503);
      expect((await lastRecord()).errorMessage).toBe('rate_limited');

      ctx.fakes.anthropic.behavior = 'bad-request';
      const bad = await call().expect(400);
      expect(bad.body.error.code).toBe('provider_rejected_request');
    });
  });

  describe('the router', () => {
    it('sends a model offered by several active providers to Gemini, the default', async () => {
      const providers = await ctx.prisma.aiProvider.findMany({
        where: { name: { in: ['Google Gemini', 'OpenAI'] } },
      });
      for (const provider of providers) {
        const model = await ctx.prisma.aiModel.upsert({
          where: {
            providerId_modelName: { providerId: provider.id, modelName: 'e2e-shared-model' },
          },
          update: {},
          create: {
            providerId: provider.id,
            modelName: 'e2e-shared-model',
            inputTokenPrice: '1.00',
            outputTokenPrice: '2.00',
          },
        });
        ctx.modelIds.push(model.id);
      }
      await setProvider(ctx, 'OpenAI', { status: 'ACTIVE' });

      await post(chat('Hi', { model: 'e2e-shared-model' })).expect(200);

      expect(ctx.fake.received).toHaveLength(1);
      expect(ctx.fakes.openai.received).toHaveLength(0);
    });
  });

  describe('circuit breakers are kept per provider', () => {
    it('opens Gemini circuit without affecting another provider', async () => {
      await setProvider(ctx, 'OpenAI', { status: 'ACTIVE' });
      ctx.fakes.gemini.behavior = 'server-error';
      for (let i = 0; i < 3; i++) await post().expect(503);

      expect(JSON.parse((await ctx.redis.client.get('provider:gemini:circuit'))!)).toMatchObject({
        state: 'OPEN',
        failureCount: 3,
      });
      // Gemini now fails fast, without being called again.
      const gemini = await post().expect(503);
      expect(Number(gemini.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(ctx.fake.received).toHaveLength(3);

      // OpenAI has its own circuit, which is untouched, and it keeps serving.
      await post(chat('Hi', { model: 'gpt-4o-mini' })).expect(200);
      expect(await ctx.redis.client.exists('provider:openai:circuit')).toBe(0);
      expect(await ctx.redis.client.exists('provider:anthropic:circuit')).toBe(0);
    });

    it('uses the documented key name for each provider', () => {
      expect(RedisKeys.circuit('gemini')).toBe('provider:gemini:circuit');
      expect(RedisKeys.circuit('openai')).toBe('provider:openai:circuit');
      expect(RedisKeys.circuit('anthropic')).toBe('provider:anthropic:circuit');
    });

    it('recovers Gemini after the wait', async () => {
      ctx.fakes.gemini.behavior = 'server-error';
      for (let i = 0; i < 3; i++) await post().expect(503);
      await sleep(900);
      ctx.fakes.gemini.behavior = 'ok';

      await post().expect(200);
      await post().expect(200);

      expect(await ctx.redis.client.exists('provider:gemini:circuit')).toBe(0);
    });
  });
});

describe('Gateway configuration without OpenAI or Anthropic (e2e)', () => {
  let ctx: TestContext;
  let fixture: Fixture;

  beforeAll(async () => {
    // Only a Gemini key is configured: no OpenAI key, no Anthropic key.
    ctx = await createTestContext({ env: { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' } });
    fixture = await createFixture(ctx, 'STARTUP');
  });
  afterAll(async () => {
    if (ctx) await destroyTestContext(ctx);
  });
  beforeEach(async () => {
    await resetTrafficState(ctx);
    ctx.fake.received.length = 0;
  });

  it('works with Gemini alone: nothing requires OpenAI', async () => {
    const res = await http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(fixture.key.raw))
      .send(chat('Hello'))
      .expect(200);
    expect(res.body.choices[0].message.content).toBe('Echo: Hello');
  });

  it('answers 503 for OpenAI and Anthropic models even if their provider rows are switched on, because they have no key', async () => {
    await setProvider(ctx, 'OpenAI', { status: 'ACTIVE' });
    await setProvider(ctx, 'Anthropic', { status: 'ACTIVE' });
    try {
      for (const model of ['gpt-4o-mini', 'claude-sonnet-4-5']) {
        const res = await http(ctx)
          .post('/v1/chat/completions')
          .set(bearer(fixture.key.raw))
          .send(chat('Hi', { model }))
          .expect(503);
        expect(res.body.error.code).toBe('provider_unavailable');
      }
    } finally {
      await setProvider(ctx, 'OpenAI', { status: 'DISABLED' });
      await setProvider(ctx, 'Anthropic', { status: 'DISABLED' });
    }
  });
});

describe('Gateway with no provider key at all (e2e)', () => {
  let ctx: TestContext;
  let fixture: Fixture;
  const lines: string[] = [];

  beforeAll(async () => {
    setLogSink((line) => lines.push(line));
    ctx = await createTestContext({
      env: { GOOGLE_AI_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
    });
    setLogSink(null);
    fixture = await createFixture(ctx, 'STARTUP');
  });
  afterAll(async () => {
    if (ctx) await destroyTestContext(ctx);
  });

  it('still boots, and warns that the default provider is not configured', () => {
    const warning = lines
      .map((line) => JSON.parse(line))
      .find((e) => e.event === 'default_provider_not_configured');
    expect(warning).toMatchObject({ level: 'warn', provider: 'gemini' });
    expect(warning.hint).toMatch(/GOOGLE_AI_API_KEY/);
  });

  it('answers requests with 503 provider_unavailable rather than failing', async () => {
    await http(ctx).get('/health').expect(200);
    const res = await http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(fixture.key.raw))
      .send(chat())
      .expect(503);
    expect(res.body.error.code).toBe('provider_unavailable');
  });
});

describe('Model limits (e2e)', () => {
  let ctx: TestContext;
  let fixture: Fixture;

  beforeAll(async () => {
    // A higher gateway ceiling, so the limits of the models themselves are what is tested.
    ctx = await createTestContext({ env: { GATEWAY_MAX_TOKENS: '100000' } });
    fixture = await createFixture(ctx, 'STARTUP');
  });
  afterAll(async () => {
    if (ctx) await destroyTestContext(ctx);
  });
  beforeEach(async () => {
    await resetTrafficState(ctx);
    ctx.fake.received.length = 0;
  });

  const post = (model: string, maxTokens: number) =>
    http(ctx)
      .post('/v1/chat/completions')
      .set(bearer(fixture.key.raw))
      .send(chat('Hi', { model, max_tokens: maxTokens }));

  it('refuses a max_tokens above what the model can produce, without calling Gemini', async () => {
    const res = await post('gemini-2.0-flash', 9_000).expect(400);
    expect(res.body.error).toMatchObject({
      code: 'max_tokens_exceeded',
      param: 'max_tokens',
      message: 'max_tokens must be at most 8192 for gemini-2.0-flash.',
    });
    expect(ctx.fake.received).toHaveLength(0);
  });

  it('allows the same request on a model with a larger output limit', async () => {
    await post('gemini-2.5-flash', 9_000).expect(200);
    await post('gemini-2.0-flash', 8_192).expect(200);
  });

  it('does not check limits of a model it knows nothing about', async () => {
    const providerId = (
      await ctx.prisma.aiProvider.findUniqueOrThrow({ where: { name: 'Google Gemini' } })
    ).id;
    const model = await ctx.prisma.aiModel.upsert({
      where: { providerId_modelName: { providerId, modelName: 'gemini-future-model' } },
      update: {},
      create: {
        providerId,
        modelName: 'gemini-future-model',
        inputTokenPrice: '1',
        outputTokenPrice: '2',
      },
    });
    ctx.modelIds.push(model.id);
    await post('gemini-future-model', 40_000).expect(200);
  });
});
