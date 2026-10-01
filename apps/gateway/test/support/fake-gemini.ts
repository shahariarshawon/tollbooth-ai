import { LEAKY_PROVIDER_MESSAGE, startFakeProvider } from './fake-server';
import type { FakeProvider, Responder } from './fake-server';

/**
 * A stand-in for the Gemini API (`generateContent`) that speaks its wire format, so the real
 * GeminiProvider is exercised end to end without a network or an API key.
 *
 *   tsx apps/gateway/test/support/fake-gemini.ts 4020      # run it by hand
 *
 * Token counts are fixed so tests can assert exact numbers: prompt = 10 + number of messages,
 * output = 7, so a single message costs 11 in and 7 out.
 */
export const FAKE_GEMINI_API_KEY = 'AIza-test-key-not-real';

const error = (status: number, code: string, message: string, reason?: string) => ({
  status,
  body: {
    error: {
      code: status,
      message,
      status: code,
      ...(reason && { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] }),
    },
  },
});

const respond: Responder = (request, behavior) => {
  if (request.headers['x-goog-api-key'] !== FAKE_GEMINI_API_KEY && behavior !== 'unauthorized') {
    return error(403, 'PERMISSION_DENIED', 'Method doesnt allow unregistered callers.');
  }

  switch (behavior) {
    case 'hang':
      return null;
    case 'unauthorized':
      // Google reports a bad key as a 400 INVALID_ARGUMENT with this reason.
      return error(400, 'INVALID_ARGUMENT', LEAKY_PROVIDER_MESSAGE, 'API_KEY_INVALID');
    case 'rate-limited':
      return error(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).');
    case 'server-error':
      return error(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.');
    case 'not-found':
      return error(404, 'NOT_FOUND', 'models/gemini-nope is not found for API version v1beta.');
    case 'bad-request':
      return error(400, 'INVALID_ARGUMENT', 'Unsupported value: temperature 1.5 is not allowed.');
    case 'blocked':
      return { status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } };
    default:
  }

  const contents = (request.body['contents'] as { parts: { text: string }[] }[] | undefined) ?? [];
  const last = contents[contents.length - 1]?.parts.map((part) => part.text).join('') ?? '';
  const model = decodeURIComponent(/models\/([^:]+):/.exec(request.url)?.[1] ?? 'unknown');
  const promptTokens = 10 + contents.length;

  return {
    status: 200,
    body: {
      candidates: [
        behavior === 'safety-stop'
          ? { finishReason: 'SAFETY', index: 0 }
          : {
              content: { role: 'model', parts: [{ text: `Echo: ${last}` }] },
              finishReason: 'STOP',
              index: 0,
            },
      ],
      ...(behavior !== 'no-usage' && {
        usageMetadata: {
          promptTokenCount: promptTokens,
          candidatesTokenCount: 7,
          // Gemini 2.5 models report reasoning tokens separately; they are billed as output.
          ...(behavior === 'thinking' && { thoughtsTokenCount: 30 }),
          totalTokenCount: promptTokens + 7 + (behavior === 'thinking' ? 30 : 0),
        },
      }),
      modelVersion: `${model}-fake`,
      responseId: 'resp-fake-123',
    },
  };
};

export const startFakeGemini = (port = 0): Promise<FakeProvider> =>
  startFakeProvider(respond, {
    path: /^\/v1beta\/models\/[^/]+:generateContent$/,
    urlSuffix: '/v1beta',
    port,
  });

if (require.main === module) {
  void startFakeGemini(Number(process.argv[2] ?? 4020)).then((fake) =>
    console.log(`Fake Gemini listening at ${fake.url}`),
  );
}
