import type { TokenCounter } from '../tokens/token-counter.service';
import { ProviderError } from './provider.interface';
import type { ChatCompletionRequest, ChatCompletionResult, TokenUsage } from './provider.interface';

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
  const requestTokens =
    result.usage?.promptTokens ?? tokens.countMessages(request.model, request.messages);
  const responseTokens =
    result.usage?.completionTokens ??
    result.choices.reduce(
      (sum, choice) => sum + tokens.countText(request.model, choice.message.content ?? ''),
      0,
    );
  return { requestTokens, responseTokens, totalTokens: requestTokens + responseTokens };
}

/**
 * Shared body for every provider's `streamCompletion`: streaming is not implemented yet (see Phase 6
 * notes in docs/architecture/provider-router.md), so a client that asks for it gets a clear, immediate
 * rejection rather than a connection that silently never streams.
 */
export function rejectStreaming(): Promise<never> {
  return Promise.reject(
    new ProviderError('bad_request', 'Streaming responses are not supported yet'),
  );
}
