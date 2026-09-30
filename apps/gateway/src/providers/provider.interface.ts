import type { ProviderType } from '@tollbooth/database';

/** Provider-neutral request. Each provider translates it to its own API. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  /** The model name exactly as the provider knows it. */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  user?: string;
}

/** Provider-neutral response, what every provider must normalise to. */
export interface ChatCompletionResult {
  id: string;
  /** Unix seconds. */
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: 'assistant'; content: string | null };
    finishReason: string | null;
  }[];
  /** Token counts as reported by the provider. Absent when the provider did not report them. */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export type ProviderErrorKind =
  /** The request itself was rejected (bad parameters). Safe to tell the caller. */
  | 'bad_request'
  /** We could not authenticate to the provider: our credentials, not the caller's. */
  | 'auth'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable';

/** Thrown by providers for any failure, already classified so callers never parse provider errors. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    /** Only meaningful for `bad_request`, where it describes the caller's own input. */
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface AIProvider {
  readonly type: ProviderType;
  /** False when credentials are missing, so the gateway can report the provider as unavailable. */
  isConfigured(): boolean;
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}

/** Injection token for the list of registered providers. Adding a provider means adding one entry. */
export const AI_PROVIDERS = Symbol('AI_PROVIDERS');
