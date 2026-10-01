import { createServer } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** What the fake providers share: a local HTTP server that records requests and can misbehave on demand. */
export type FakeBehavior =
  | 'ok'
  | 'no-usage'
  | 'server-error'
  | 'unauthorized'
  | 'rate-limited'
  | 'bad-request'
  | 'not-found'
  | 'blocked'
  | 'safety-stop'
  | 'thinking'
  | 'hang';

export interface ReceivedRequest {
  url: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

export interface FakeProvider {
  /** Base URL to give the gateway for this provider. */
  url: string;
  behavior: FakeBehavior;
  received: ReceivedRequest[];
  close: () => Promise<void>;
}

/** The reply a fake sends for the current behaviour: a status and a JSON body, or null to never answer. */
export type Responder = (
  request: ReceivedRequest,
  behavior: FakeBehavior,
) => { status: number; body: unknown } | null;

/** A message that would leak if the gateway forwarded provider errors: real providers echo part of the key. */
export const LEAKY_PROVIDER_MESSAGE =
  'API key not valid: AIzaSy-SECRETKEYFRAGMENT. Please pass a valid API key.';

export async function startFakeProvider(
  respond: Responder,
  options: { path: RegExp; urlSuffix?: string; port?: number },
): Promise<FakeProvider> {
  const state: FakeProvider = {
    url: '',
    behavior: 'ok',
    received: [],
    close: async () => undefined,
  };
  const hanging = new Set<() => void>();

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      const url = req.url ?? '';
      if (req.method !== 'POST' || !options.path.test(url)) {
        return send(404, { error: { message: 'Not found' } });
      }
      const request: ReceivedRequest = {
        url,
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>,
      };
      state.received.push(request);

      const reply = respond(request, state.behavior);
      if (reply === null) {
        // Never answers; the gateway timeout has to rescue the caller. Released on close().
        hanging.add(() => res.destroy());
        return;
      }
      send(reply.status, reply.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${options.urlSuffix ?? ''}`;
  state.close = () =>
    new Promise<void>((resolve) => {
      hanging.forEach((release) => release());
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return state;
}
