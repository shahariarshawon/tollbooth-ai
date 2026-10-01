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

/** Final token counts for one call, in the same shape whichever provider served it. */
export interface TokenUsage {
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
}

/** What the gateway may know about a model without asking the provider. Prices are not here: they live in the database. */
export interface ModelInfo {
  name: string;
  /** Most tokens the model accepts in the prompt. */
  contextWindow: number;
  /** Most tokens the model will generate in one reply. */
  maxOutputTokens: number;
}

/** Stable short name of a provider. Used in logs and in the circuit breaker key (`provider:gemini:circuit`). */
export type ProviderId = 'gemini' | 'openai' | 'anthropic';

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

/**
 * What every AI provider implements. The gateway only ever talks to this interface, so supporting a new
 * provider means writing one class and registering it; nothing in the request pipeline changes.
 */
export interface AIProvider {
  /** Short stable name: `gemini`, `openai`, `anthropic`. */
  readonly id: ProviderId;
  /** The matching value of the database `ProviderType` enum. */
  readonly type: ProviderType;

  /** False when credentials are missing, so the gateway can report the provider as unavailable. */
  isConfigured(): boolean;

  /** Human-readable name for logs, error messages and the dashboard. `id` stays the short, stable key. */
  getProviderName(): string;

  /** Sends the conversation and returns the reply in the neutral shape. Throws ProviderError on failure. */
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult>;

  /**
   * Streaming is not implemented yet (see "What is not done" in docs/architecture/provider-router.md).
   * Every provider still exposes the method, so a caller gets one consistent, classified rejection
   * (`ProviderError('bad_request', ...)`) instead of each adapter failing differently.
   */
  streamCompletion(request: ChatCompletionRequest): Promise<never>;

  /** Static facts about a model (context window, output limit), or undefined for models it does not know. */
  getModelInfo(model: string): ModelInfo | undefined;

  /** True when this provider recognises the model by itself, independent of the database catalogue. */
  validateModel(model: string): boolean;

  /**
   * Token counts for a finished call: what the provider reported when it reported anything (each provider
   * knows how its own usage fields map, for example Gemini counts "thinking" tokens as output), otherwise
   * an estimate.
   */
  calculateUsage(request: ChatCompletionRequest, result: ChatCompletionResult): TokenUsage;
}

/** Injection token for the list of registered providers. Adding a provider means adding one entry. */
export const AI_PROVIDERS = Symbol('AI_PROVIDERS');
