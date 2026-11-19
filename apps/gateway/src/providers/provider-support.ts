import type { TokenCounter } from '../tokens/token-counter.service';
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResult,
  TokenUsage,
} from './provider.interface';

/**
 * The default way to turn a result into token counts: trust what the provider reported, and count for
 * ourselves only what it left out. Counting uses an OpenAI vocabulary, which is exact for OpenAI and a
 * close approximation for other models; that is acceptable for a fallback, and the provider figure
 * always wins when present.
 */
export function usageFromResult(
  tokens: TokenCounter,
  request: ChatCompletionRequest,
  result: ChatCompletionResult,
): TokenUsage {
  const isEstimated =
    result.usage?.promptTokens === undefined || result.usage?.completionTokens === undefined;
  const requestTokens =
    result.usage?.promptTokens ?? tokens.countMessages(request.model, request.messages);
  const responseTokens =
    result.usage?.completionTokens ??
    result.choices.reduce(
      (sum, choice) => sum + tokens.countText(request.model, choice.message.content ?? ''),
      0,
    );
  return {
    requestTokens,
    responseTokens,
    totalTokens: requestTokens + responseTokens,
    ...(isEstimated ? { isEstimatedTokens: true } : {}),
  };
}

/**
 * Streams completion chunks from a completed response, splitting deltas into chunks.
 * Responds to AbortSignal if client disconnects.
 */
export async function* synthesizeChunkStream(
  result: ChatCompletionResult,
  signal?: AbortSignal,
): AsyncIterable<ChatCompletionChunk> {
  const content = result.choices[0]?.message.content ?? '';
  const now = result.created;

  // Initial delta indicating assistant role
  yield {
    id: result.id,
    created: now,
    model: result.model,
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finishReason: null,
      },
    ],
  };

  // Stream content in segments
  const chunks = content.match(/(\S+\s*)/g) ?? (content ? [content] : []);
  for (const chunk of chunks) {
    if (signal?.aborted) return;
    yield {
      id: result.id,
      created: now,
      model: result.model,
      choices: [
        {
          index: 0,
          delta: { content: chunk },
          finishReason: null,
        },
      ],
    };
  }

  // Final chunk indicating finish reason
  yield {
    id: result.id,
    created: now,
    model: result.model,
    choices: [
      {
        index: 0,
        delta: {},
        finishReason: result.choices[0]?.finishReason ?? 'stop',
      },
    ],
    ...(result.usage && { usage: result.usage }),
  };
}
