import { setLogSink } from '../src/common/logging/structured-logger';
import {
  bearer,
  chat,
  createFixture,
  createTestContext,
  destroyTestContext,
  http,
} from './support/context';
import type { Fixture, TestContext } from './support/context';

describe('Chat completions (e2e)', () => {
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

  const post = (
    body: unknown = chat(),
    headers: Record<string, string> = bearer(fixture.key.raw),
  ) =>
    http(ctx)
      .post('/v1/chat/completions')
      .set(headers)
      .send(body as object);

  const records = () =>
    ctx.prisma.aiRequest.findMany({
      where: { tenantId: fixture.tenantId },
      orderBy: { createdAt: 'desc' },
    });

  describe('a successful completion', () => {
    it('returns an OpenAI shaped response', async () => {
      const res = await post(chat('Hello', { temperature: 0.7 })).expect(200);

      expect(res.body).toMatchObject({
        id: 'chatcmpl-fake123',
        object: 'chat.completion',
        created: 1_700_000_000,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Echo: Hello' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      });
      expect(typeof res.body.model).toBe('string');
    });

    it('passes the supported parameters to the provider', async () => {
      await post(
        chat('Hi', {
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 50,
          stop: 'END',
          presence_penalty: 0.5,
          frequency_penalty: -0.5,
          user: 'end-user-42',
        }),
      ).expect(200);

      expect(ctx.fake.received).toHaveLength(1);
      expect(ctx.fake.received[0]?.body).toMatchObject({
        model: 'gpt-4',
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 50,
        stop: ['END'],
        presence_penalty: 0.5,
        frequency_penalty: -0.5,
        user: 'end-user-42',
        messages: [{ role: 'user', content: 'Hi' }],
      });
    });

    it('authenticates to the provider with the gateway own key, never the caller key', async () => {
      await post().expect(200);
      const sent = ctx.fake.received[0]?.headers.authorization;
      expect(sent).toBe('Bearer sk-test-e2e-not-a-real-key');
      expect(sent).not.toContain(fixture.key.raw);
    });

    it('saves a request record with tenant, project, key, tokens, latency and status', async () => {
      await post(chat('Save me')).expect(200);

      const [record] = await records();
      expect(record).toMatchObject({
        tenantId: fixture.tenantId,
        projectId: fixture.projectId,
        apiKeyId: fixture.key.id,
        provider: 'OPENAI',
        model: 'gpt-4',
        requestTokens: 11,
        responseTokens: 7,
        totalTokens: 18,
        status: 'SUCCESS',
        errorMessage: null,
      });
      expect(record?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(record?.latencyMs).toBeLessThan(5000);
      // Cost belongs to the billing phase.
      expect(Number(record?.estimatedCost)).toBe(0);
    });

    it('falls back to its own token count when the provider reports no usage', async () => {
      ctx.fake.behavior = 'no-usage';
      const res = await post(chat('Count these tokens please')).expect(200);

      const { prompt_tokens, completion_tokens, total_tokens } = res.body.usage;
      expect(prompt_tokens).toBeGreaterThan(5);
      expect(completion_tokens).toBeGreaterThan(0);
      expect(total_tokens).toBe(prompt_tokens + completion_tokens);

      const [record] = await records();
      expect(record).toMatchObject({
        requestTokens: prompt_tokens,
        responseTokens: completion_tokens,
        totalTokens: total_tokens,
        status: 'SUCCESS',
      });
    });

    it('accepts gpt-4o-mini style model names from the catalogue', async () => {
      await post(chat('Hi', { model: 'gpt-4o-mini' })).expect(200);
    });
  });

  describe('request ids and logging', () => {
    it('returns a generated X-Request-ID on every response, including errors', async () => {
      const ok = await post().expect(200);
      const bad = await post(chat(), { Authorization: 'Bearer nope' }).expect(401);
      expect(ok.headers['x-request-id']).toMatch(/^req_[0-9a-f]{32}$/);
      expect(bad.headers['x-request-id']).toMatch(/^req_[0-9a-f]{32}$/);
      expect(ok.headers['x-request-id']).not.toBe(bad.headers['x-request-id']);
    });

    it('echoes a safe caller supplied id and replaces an unsafe one', async () => {
      const safe = await post(chat(), {
        ...bearer(fixture.key.raw),
        'X-Request-ID': 'trace-abc_123.456',
      });
      expect(safe.headers['x-request-id']).toBe('trace-abc_123.456');

      const unsafe = await post(chat(), { ...bearer(fixture.key.raw), 'X-Request-ID': 'x y\tz' });
      expect(unsafe.headers['x-request-id']).toMatch(/^req_/);
    });

    it('writes one structured log line with request id, tenant, model and latency, and no prompt', async () => {
      const lines: string[] = [];
      setLogSink((line) => lines.push(line));
      try {
        const res = await post(chat('a very private prompt')).expect(200);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const requestId = String(res.headers['x-request-id']);
        const entry = JSON.parse(lines.find((line) => line.includes(requestId))!);
        expect(entry).toMatchObject({
          requestId,
          tenantId: fixture.tenantId,
          projectId: fixture.projectId,
          model: 'gpt-4',
          statusCode: 200,
          method: 'POST',
          path: '/v1/chat/completions',
        });
        expect(typeof entry.latency).toBe('number');
        const everything = lines.join('\n');
        expect(everything).not.toContain('a very private prompt');
        expect(everything).not.toContain(fixture.key.raw);
      } finally {
        setLogSink(null);
      }
    });
  });

  describe('model validation', () => {
    it('rejects an unknown model with 400 and does not call the provider', async () => {
      const res = await post(chat('Hi', { model: 'unknown-model' })).expect(400);
      expect(res.body.error).toMatchObject({
        type: 'invalid_request_error',
        code: 'model_not_found',
        param: 'model',
      });
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('rejects a model that exists but is switched off', async () => {
      const res = await post(chat('Hi', { model: 'e2e-inactive-model' })).expect(400);
      expect(res.body.error.code).toBe('model_unavailable');
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('answers 503 when the provider of a model is disabled', async () => {
      const res = await post(chat('Hi', { model: 'e2e-disabled-provider-model' })).expect(503);
      expect(res.body.error.code).toBe('provider_unavailable');
    });

    it('answers 503 for a model whose provider has no implementation yet', async () => {
      const res = await post(chat('Hi', { model: 'claude-sonnet-4-5' })).expect(503);
      expect(res.body.error.code).toBe('provider_unavailable');
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('does not record requests that never reached a provider', async () => {
      const before = (await records()).length;
      await post(chat('Hi', { model: 'unknown-model' })).expect(400);
      await post(chat('Hi', { model: 'e2e-inactive-model' })).expect(400);
      expect((await records()).length).toBe(before);
    });
  });

  describe('request validation', () => {
    it.each([
      ['model is missing', { messages: [{ role: 'user', content: 'Hi' }] }, 'model'],
      ['messages is missing', { model: 'gpt-4' }, 'messages'],
      ['messages is empty', { model: 'gpt-4', messages: [] }, 'messages'],
      ['messages is not an array', { model: 'gpt-4', messages: 'Hi' }, 'messages'],
      [
        'a message has an invalid role',
        { model: 'gpt-4', messages: [{ role: 'robot', content: 'Hi' }] },
        'messages.0.role',
      ],
      [
        'a message has no content',
        { model: 'gpt-4', messages: [{ role: 'user' }] },
        'messages.0.content',
      ],
      ['temperature is too high', chat('Hi', { temperature: 5 }), 'temperature'],
      ['temperature is negative', chat('Hi', { temperature: -0.1 }), 'temperature'],
      ['temperature is not a number', chat('Hi', { temperature: 'hot' }), 'temperature'],
      ['top_p is above 1', chat('Hi', { top_p: 1.5 }), 'top_p'],
      ['max_tokens is zero', chat('Hi', { max_tokens: 0 }), 'max_tokens'],
      ['max_tokens is fractional', chat('Hi', { max_tokens: 10.5 }), 'max_tokens'],
      ['n is greater than 1', chat('Hi', { n: 3 }), 'n'],
      ['stop has too many sequences', chat('Hi', { stop: ['a', 'b', 'c', 'd', 'e'] }), 'stop'],
    ])('returns 400 when %s', async (_label, body, param) => {
      const res = await post(body).expect(400);
      expect(res.body.error).toMatchObject({
        type: 'invalid_request_error',
        code: 'invalid_request',
        param,
      });
      expect(typeof res.body.error.message).toBe('string');
      expect(ctx.fake.received).toHaveLength(0);
    });

    it('enforces the configured max_tokens ceiling', async () => {
      const res = await post(chat('Hi', { max_tokens: 4097 })).expect(400);
      expect(res.body.error).toMatchObject({ param: 'max_tokens', code: 'max_tokens_exceeded' });
      await post(chat('Hi', { max_tokens: 4096 })).expect(200);
    });

    it('rejects parameters it does not support instead of silently ignoring them', async () => {
      const res = await post(
        chat('Hi', { tools: [], response_format: { type: 'json_object' } }),
      ).expect(400);
      expect(res.body.error).toMatchObject({ code: 'unknown_parameter' });
      expect(res.body.error.param).toMatch(/^(tools|response_format)$/);
    });

    it('rejects unknown fields inside a message', async () => {
      const res = await post({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi', tool_calls: [] }],
      }).expect(400);
      expect(res.body.error).toMatchObject({
        code: 'unknown_parameter',
        param: 'messages.0.tool_calls',
      });
    });

    it('refuses streaming with a clear message', async () => {
      const res = await post(chat('Hi', { stream: true })).expect(400);
      expect(res.body.error).toMatchObject({ code: 'streaming_not_supported', param: 'stream' });
      await post(chat('Hi', { stream: false })).expect(200);
    });

    it('rejects malformed JSON', async () => {
      const res = await http(ctx)
        .post('/v1/chat/completions')
        .set(bearer(fixture.key.raw))
        .set('Content-Type', 'application/json')
        .send('{"model": "gpt-4", ')
        .expect(400);
      expect(res.body.error.code).toBe('invalid_json');
    });

    it('rejects a body over the size limit', async () => {
      const res = await post(chat('x'.repeat(1_100_000))).expect(413);
      expect(res.body.error.code).toBe('request_too_large');
    });
  });

  describe('provider failures', () => {
    const leakChecks = (body: unknown) => {
      const text = JSON.stringify(body);
      expect(text).not.toContain('SECRETKEYFRAGMENT');
      expect(text).not.toContain('sk-test');
      expect(text).not.toMatch(/stack|node_modules|at .*\(|prisma|ECONN/i);
    };

    it('turns a provider outage into 503 and records a FAILED request', async () => {
      ctx.fake.behavior = 'server-error';
      const res = await post(chat('Will fail')).expect(503);

      expect(res.body.error).toMatchObject({ type: 'api_error', code: 'provider_unavailable' });
      leakChecks(res.body);

      const [record] = await records();
      expect(record).toMatchObject({
        tenantId: fixture.tenantId,
        apiKeyId: fixture.key.id,
        provider: 'OPENAI',
        model: 'gpt-4',
        status: 'FAILED',
        errorMessage: 'unavailable',
        responseTokens: 0,
      });
      // The input is still counted, so a failed call shows what the caller sent.
      expect(record?.requestTokens).toBeGreaterThan(0);
      expect(record?.totalTokens).toBe(record?.requestTokens);
    });

    it('never forwards the provider error text when our own provider credentials are rejected', async () => {
      ctx.fake.behavior = 'unauthorized';
      const res = await post().expect(503);
      leakChecks(res.body);
      expect(res.body.error.message).toBe(
        'The AI provider is currently unavailable. Please try again later.',
      );

      const [record] = await records();
      expect(record?.status).toBe('FAILED');
      expect(record?.errorMessage).toBe('auth');
      leakChecks(record);
    });

    it('reports provider rate limiting as 503', async () => {
      ctx.fake.behavior = 'rate-limited';
      const res = await post().expect(503);
      expect(res.body.error.code).toBe('provider_unavailable');
      expect((await records())[0]?.errorMessage).toBe('rate_limited');
    });

    it('relays a provider rejection of the request itself as 400', async () => {
      ctx.fake.behavior = 'bad-request';
      const res = await post(chat('Hi', { temperature: 1.5 })).expect(400);
      expect(res.body.error).toMatchObject({
        type: 'invalid_request_error',
        code: 'provider_rejected_request',
      });
      expect(res.body.error.message).toContain('temperature');
      expect((await records())[0]?.status).toBe('FAILED');
    });

    it('gives up on a provider that never answers', async () => {
      ctx.fake.behavior = 'hang';
      const started = Date.now();
      const res = await post().expect(503);
      expect(Date.now() - started).toBeLessThan(5000);
      expect(res.body.error.code).toBe('provider_unavailable');
      const record = (await records())[0];
      expect(record?.status).toBe('FAILED');
      // Under Jest the SDK cannot recognise the abort (it crosses a VM realm) and reports a generic
      // connection error; in a real process it is 'timeout'. Both mean the provider did not answer.
      expect(record?.errorMessage).toMatch(/^(timeout|unavailable)$/);
    });

    it('recovers on the next request after a failure', async () => {
      ctx.fake.behavior = 'server-error';
      await post().expect(503);
      ctx.fake.behavior = 'ok';
      await post().expect(200);
    });
  });

  describe('error format', () => {
    it('answers unknown routes in the OpenAI error shape', async () => {
      const res = await http(ctx).get('/v1/nothing').set(bearer(fixture.key.raw)).expect(404);
      expect(res.body.error).toMatchObject({ code: 'not_found', type: 'invalid_request_error' });
    });

    it('never adds fields other than message, type, param and code', async () => {
      const res = await post(chat('Hi', { model: 'unknown-model' })).expect(400);
      expect(Object.keys(res.body)).toEqual(['error']);
      expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message', 'param', 'type']);
    });
  });
});
