import { asObject } from './provider-http';
import { ProviderError } from './provider.interface';
import type { ChatCompletionRequest, ChatCompletionResult } from './provider.interface';

/**
 * Translation between the neutral chat format and the Anthropic Messages API. Pure functions with no
 * I/O.
 *
 * Parameters Anthropic does not have are left out rather than rejected: `presence_penalty`,
 * `frequency_penalty` and `user`. Temperature is capped at 1 (Anthropic range is 0 to 1, the gateway
 * accepts OpenAI's 0 to 2), and `top_p` is dropped when a temperature is set because newer Claude models
 * refuse both together.
 */

/** Anthropic requires max_tokens on every request, so a request without one gets this. */
export const DEFAULT_MAX_TOKENS = 1024;

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: { role: 'user' | 'assistant'; content: string }[];
  system?: string;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
}

export function toAnthropicRequest(request: ChatCompletionRequest): AnthropicRequestBody {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content);
  const messages = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));

  if (messages.length === 0) {
    throw new ProviderError('bad_request', 'At least one user or assistant message is required');
  }

  return {
    model: request.model,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages,
    ...(system.length > 0 && { system: system.join('\n\n') }),
    ...(request.temperature !== undefined && { temperature: Math.min(1, request.temperature) }),
    ...(request.temperature === undefined && request.topP !== undefined && { top_p: request.topP }),
    ...(request.stop !== undefined && { stop_sequences: request.stop }),
  };
}

const STOP_REASONS: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  refusal: 'content_filter',
};

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function fromAnthropicResponse(
  data: unknown,
  request: ChatCompletionRequest,
  now: () => number = Date.now,
): ChatCompletionResult {
  const body = asObject(data);
  const blocks = Array.isArray(body?.['content']) ? (body['content'] as unknown[]) : [];
  if (!body || typeof body['id'] !== 'string') {
    throw new ProviderError('unavailable', 'The provider returned no answer');
  }

  const text = blocks
    .map((block) => asObject(block))
    .filter((block) => block?.['type'] === 'text')
    .map((block) => (typeof block?.['text'] === 'string' ? block['text'] : ''))
    .join('');

  const stop = typeof body['stop_reason'] === 'string' ? body['stop_reason'] : null;
  const usage = asObject(body['usage']);
  const promptTokens = num(usage?.['input_tokens']);
  const completionTokens = num(usage?.['output_tokens']) ?? 0;

  return {
    id: body['id'],
    created: Math.floor(now() / 1000),
    model: typeof body['model'] === 'string' ? body['model'] : request.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finishReason: stop === null ? null : (STOP_REASONS[stop] ?? stop),
      },
    ],
    ...(promptTokens !== undefined && {
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    }),
  };
}

export function readAnthropicError(data: unknown): { message?: string; type?: string } {
  const error = asObject(asObject(data)?.['error']);
  return {
    ...(typeof error?.['message'] === 'string' && { message: error['message'] }),
    ...(typeof error?.['type'] === 'string' && { type: error['type'] }),
  };
}
