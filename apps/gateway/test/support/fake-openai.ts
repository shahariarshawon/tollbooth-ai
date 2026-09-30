import { createServer } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for the OpenAI API that speaks its wire format, so the real OpenAIProvider (and the SDK
 * underneath) is exercised end to end without network access or an API key.
 *
 *   tsx apps/gateway/test/support/fake-openai.ts 4010      # run it by hand
 */
export type FakeBehavior =
  'ok' | 'no-usage' | 'server-error' | 'unauthorized' | 'rate-limited' | 'bad-request' | 'hang';

export interface FakeOpenAi {
  /** Base URL to use as OPENAI_BASE_URL, including /v1. */
  url: string;
  behavior: FakeBehavior;
  /** Every chat completion request received, for assertions. */
  received: { headers: IncomingHttpHeaders; body: Record<string, unknown> }[];
  close: () => Promise<void>;
}

// A message that would leak if the gateway forwarded provider errors: real OpenAI 401s echo part of the key.
export const LEAKY_PROVIDER_MESSAGE =
  'Incorrect API key provided: sk-test-SECRETKEYFRAGMENT. You can find your API key at https://platform.openai.com.';

const errorBody = (message: string, type: string, code: string | null) =>
  JSON.stringify({ error: { message, type, param: null, code } });

export async function startFakeOpenAi(port = 0): Promise<FakeOpenAi> {
  const state: FakeOpenAi = {
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
      const send = (status: number, body: string) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(body);
      };

      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        return send(404, errorBody('Not found', 'invalid_request_error', null));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<
        string,
        unknown
      >;
      state.received.push({ headers: req.headers, body });

      switch (state.behavior) {
        case 'unauthorized':
          return send(
            401,
            errorBody(LEAKY_PROVIDER_MESSAGE, 'invalid_request_error', 'invalid_api_key'),
          );
        case 'rate-limited':
          return send(
            429,
            errorBody('Rate limit reached for requests', 'requests', 'rate_limit_exceeded'),
          );
        case 'server-error':
          return send(
            500,
            errorBody(
              'The server had an error while processing your request',
              'server_error',
              null,
            ),
          );
        case 'bad-request':
          return send(
            400,
            errorBody(
              "Unsupported value: 'temperature' does not support 1.5 with this model.",
              'invalid_request_error',
              'unsupported_value',
            ),
          );
        case 'hang':
          // Never answers; the gateway timeout has to rescue the caller. Released on close().
          hanging.add(() => res.destroy());
          return;
        default:
      }

      const messages = (body['messages'] as { content: string }[] | undefined) ?? [];
      const last = messages[messages.length - 1]?.content ?? '';
      const completion = {
        id: 'chatcmpl-fake123',
        object: 'chat.completion',
        created: 1_700_000_000,
        model: `${String(body['model'])}-fake`,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: `Echo: ${last}` },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
        ...(state.behavior === 'ok' && {
          usage: {
            prompt_tokens: 10 + messages.length,
            completion_tokens: 7,
            total_tokens: 17 + messages.length,
          },
        }),
      };
      send(200, JSON.stringify(completion));
    });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  state.close = () =>
    new Promise<void>((resolve) => {
      hanging.forEach((release) => release());
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return state;
}

if (require.main === module) {
  void startFakeOpenAi(Number(process.argv[2] ?? 4010)).then((fake) => {
    console.log(`Fake OpenAI listening at ${fake.url}`);
  });
}
