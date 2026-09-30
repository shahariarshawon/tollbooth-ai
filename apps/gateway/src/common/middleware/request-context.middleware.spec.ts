import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { setLogSink } from '../logging/structured-logger';
import type { GatewayRequest } from '../types/gateway-request';
import { requestContextMiddleware } from './request-context.middleware';

function run(headers: Record<string, string> = {}, extra: Partial<GatewayRequest> = {}) {
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader: jest.fn(),
  }) as unknown as Response & EventEmitter;
  const req = {
    headers,
    method: 'POST',
    originalUrl: '/v1/chat/completions?x=1',
    body: { model: 'gpt-4', messages: [{ role: 'user', content: 'secret prompt' }] },
    ...extra,
  } as unknown as GatewayRequest;
  const next = jest.fn();
  requestContextMiddleware(req, res, next);
  return { req, res, next };
}

describe('requestContextMiddleware', () => {
  afterEach(() => setLogSink(null));

  it('generates an id, exposes it as X-Request-ID and continues', () => {
    const { req, res, next } = run();
    expect(req.id).toMatch(/^req_[0-9a-f]{32}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a different id for each request', () => {
    expect(run().req.id).not.toBe(run().req.id);
  });

  it('keeps a safe supplied id', () => {
    expect(run({ 'x-request-id': 'my-trace.id_01' }).req.id).toBe('my-trace.id_01');
  });

  it.each([
    'short',
    'has space in it',
    'new\nline-injection',
    'x'.repeat(65),
    '<script>alert(1)</script>',
  ])('replaces the unsafe supplied id %j', (value) => {
    expect(run({ 'x-request-id': value }).req.id).toMatch(/^req_/);
  });

  it('logs one structured line on finish without the prompt or the query string', () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    const { req, res } = run(
      {},
      {
        auth: { tenantId: 't1', projectId: 'p1', apiKeyId: 'k1', permissions: [], rateLimit: null },
      },
    );

    expect(lines).toHaveLength(0);
    res.statusCode = 201;
    res.emit('finish');

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      level: 'info',
      requestId: req.id,
      tenantId: 't1',
      projectId: 'p1',
      model: 'gpt-4',
      statusCode: 201,
      path: '/v1/chat/completions',
    });
    expect(typeof entry.latency).toBe('number');
    expect(lines[0]).not.toContain('secret prompt');
  });

  it('logs null tenant for unauthenticated requests', () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    run().res.emit('finish');
    expect(JSON.parse(lines[0]!)).toMatchObject({ tenantId: null, projectId: null });
  });
});
