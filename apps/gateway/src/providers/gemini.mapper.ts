import { randomUUID } from 'node:crypto';
import { asObject } from './provider-http';
import { ProviderError } from './provider.interface';
import type { ChatCompletionRequest, ChatCompletionResult } from './provider.interface';

/**
 * Translation between the gateway's neutral chat format and the Gemini `generateContent` API. Pure
 * functions with no I/O, so the whole mapping can be tested without a network.
 */

interface GeminiPart {
  text: string;
}

export interface GeminiRequestBody {
  contents: { role: 'user' | 'model'; parts: GeminiPart[] }[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig: Record<string, unknown>;
}

export function toGeminiRequest(request: ChatCompletionRequest): GeminiRequestBody {
  // Gemini keeps instructions apart from the conversation, and calls the assistant "model".
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content);
  const contents = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: message.content }],
    }));

  if (contents.length === 0) {
    throw new ProviderError('bad_request', 'At least one user or assistant message is required');
  }

  return {
    contents,
    ...(system.length > 0 && { systemInstruction: { parts: [{ text: system.join('\n\n') }] } }),
    generationConfig: {
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.topP !== undefined && { topP: request.topP }),
      ...(request.maxTokens !== undefined && { maxOutputTokens: request.maxTokens }),
      ...(request.stop !== undefined && { stopSequences: request.stop }),
      ...(request.presencePenalty !== undefined && { presencePenalty: request.presencePenalty }),
      ...(request.frequencyPenalty !== undefined && { frequencyPenalty: request.frequencyPenalty }),
    },
  };
}

/** Gemini finish reasons, as OpenAI-style ones. */
const FINISH_REASONS: Record<string, string> = {
  STOP: 'stop',
  MAX_TOKENS: 'length',
  SAFETY: 'content_filter',
  RECITATION: 'content_filter',
  BLOCKLIST: 'content_filter',
  PROHIBITED_CONTENT: 'content_filter',
  SPII: 'content_filter',
  IMAGE_SAFETY: 'content_filter',
};

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function fromGeminiResponse(
  data: unknown,
  request: ChatCompletionRequest,
  now: () => number = Date.now,
): ChatCompletionResult {
  const body = asObject(data);
  const candidates = Array.isArray(body?.['candidates']) ? (body['candidates'] as unknown[]) : [];
  const candidate = asObject(candidates[0]);

  if (!candidate) {
    // No candidate means the prompt itself was refused by Gemini safety systems: the caller's input.
    const blockReason = asObject(body?.['promptFeedback'])?.['blockReason'];
    if (typeof blockReason === 'string') {
      throw new ProviderError(
        'bad_request',
        `The prompt was blocked by the provider (${blockReason})`,
      );
    }
    throw new ProviderError('unavailable', 'The provider returned no answer');
  }

  const parts = asObject(candidate['content'])?.['parts'];
  const text = (Array.isArray(parts) ? parts : [])
    .map((part) => asObject(part))
    // "Thought" parts are the model's reasoning, not part of the answer.
    .filter((part) => part !== undefined && part['thought'] !== true)
    .map((part) => (typeof part?.['text'] === 'string' ? part['text'] : ''))
    .join('');

  const finish = typeof candidate['finishReason'] === 'string' ? candidate['finishReason'] : null;
  const finishReason = finish === null ? null : (FINISH_REASONS[finish] ?? finish.toLowerCase());

  const metadata = asObject(body?.['usageMetadata']);
  const promptTokens = num(metadata?.['promptTokenCount']);
  // Reasoning ("thinking") tokens are generated and billed as output, so they count as output.
  const completionTokens =
    (num(metadata?.['candidatesTokenCount']) ?? 0) + (num(metadata?.['thoughtsTokenCount']) ?? 0);

  return {
    id: `gemini-${typeof body?.['responseId'] === 'string' ? body['responseId'] : randomUUID()}`,
    created: Math.floor(now() / 1000),
    model: typeof body?.['modelVersion'] === 'string' ? body['modelVersion'] : request.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text === '' && finishReason === 'content_filter' ? null : text,
        },
        finishReason,
      },
    ],
    ...(promptTokens !== undefined && {
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    }),
  };
}

/** The error text and machine reason from a Gemini error body, if it has them. */
export function readGeminiError(data: unknown): {
  message?: string;
  status?: string;
  reason?: string;
} {
  const error = asObject(asObject(data)?.['error']);
  const details = Array.isArray(error?.['details']) ? (error['details'] as unknown[]) : [];
  const reason = details
    .map((detail) => asObject(detail)?.['reason'])
    .find((value): value is string => typeof value === 'string');
  return {
    ...(typeof error?.['message'] === 'string' && { message: error['message'] }),
    ...(typeof error?.['status'] === 'string' && { status: error['status'] }),
    ...(reason !== undefined && { reason }),
  };
}
