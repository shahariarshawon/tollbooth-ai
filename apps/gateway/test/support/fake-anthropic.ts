import { LEAKY_PROVIDER_MESSAGE, startFakeProvider } from './fake-server';
import type { FakeProvider, Responder } from './fake-server';

/** A stand-in for the Anthropic Messages API, speaking its wire format. Same fixed token counts as the other fakes. */
export const FAKE_ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';

const error = (status: number, type: string, message: string) => ({
  status,
  body: { type: 'error', error: { type, message } },
});

const respond: Responder = (request, behavior) => {
  if (request.headers['x-api-key'] !== FAKE_ANTHROPIC_API_KEY && behavior !== 'unauthorized') {
    return error(401, 'authentication_error', 'invalid x-api-key');
  }
  if (!request.headers['anthropic-version']) {
    return error(400, 'invalid_request_error', 'anthropic-version header is required');
  }

  switch (behavior) {
    case 'hang':
      return null;
    case 'unauthorized':
      return error(401, 'authentication_error', LEAKY_PROVIDER_MESSAGE);
    case 'rate-limited':
      return error(
        429,
        'rate_limit_error',
        'Number of request tokens has exceeded your rate limit.',
      );
    case 'server-error':
      return error(529, 'overloaded_error', 'Overloaded');
    case 'not-found':
      return error(404, 'not_found_error', 'model: claude-nope');
    case 'bad-request':
      return error(400, 'invalid_request_error', 'temperature: range: 0..1');
    default:
  }

  const messages = (request.body['messages'] as { content: string }[] | undefined) ?? [];
  const last = messages[messages.length - 1]?.content ?? '';
  return {
    status: 200,
    body: {
      id: 'msg_fake123',
      type: 'message',
      role: 'assistant',
      model: String(request.body['model']),
      content: [{ type: 'text', text: `Echo: ${last}` }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10 + messages.length, output_tokens: 7 },
    },
  };
};

export const startFakeAnthropic = (): Promise<FakeProvider> =>
  startFakeProvider(respond, { path: /^\/v1\/messages$/ });
