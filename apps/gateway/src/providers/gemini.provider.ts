import { Inject, Injectable } from '@nestjs/common';
import type { ProviderType } from '@tollbooth/database';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { TokenCounter } from '../tokens/token-counter.service';
import { fromGeminiResponse, readGeminiError, toGeminiRequest } from './gemini.mapper';
import { lookupModelInfo, modelIsKnown, PROVIDER_DISPLAY_NAMES } from './model-info';
import { errorForStatus, postJson } from './provider-http';
import { rejectStreaming, usageFromResult } from './provider-support';
import { withProviderRetry } from './provider-retry';
import { ProviderError } from './provider.interface';
import type {
  AIProvider,
  ChatCompletionRequest,
  ChatCompletionResult,
  ModelInfo,
  ProviderId,
  TokenUsage,
} from './provider.interface';

/**
 * Google Gemini, through the Google AI Studio API (`generativelanguage.googleapis.com`).
 *
 * The API key travels in the `x-goog-api-key` header, never in the URL, so it cannot end up in an access
 * log or an error message that echoes the URL.
 */
@Injectable()
export class GeminiProvider implements AIProvider {
  readonly id: ProviderId = 'gemini';
  readonly type: ProviderType = 'GOOGLE';

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly tokens: TokenCounter,
  ) {
    this.apiKey = config.GOOGLE_AI_API_KEY;
    this.baseUrl = config.GOOGLE_AI_BASE_URL.replace(/\/+$/, '');
    this.timeoutMs = config.GATEWAY_PROVIDER_TIMEOUT_MS;
    this.maxRetries = config.GATEWAY_MAX_PROVIDER_RETRIES;
  }

  isConfigured(): boolean {
    return this.apiKey !== undefined;
  }

  getProviderName(): string {
    return PROVIDER_DISPLAY_NAMES[this.id];
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (!this.apiKey) throw new ProviderError('unavailable', 'Gemini is not configured');

    return withProviderRetry(() => this.attempt(request), { maxRetries: this.maxRetries });
  }

  streamCompletion(): Promise<never> {
    return rejectStreaming();
  }

  private async attempt(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const { status, data } = await postJson(
      `${this.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`,
      {
        headers: { 'x-goog-api-key': this.apiKey! },
        body: toGeminiRequest(request),
        timeoutMs: this.timeoutMs,
      },
    );

    if (status < 200 || status >= 300) throw this.classify(status, data);
    return fromGeminiResponse(data, request);
  }

  getModelInfo(model: string): ModelInfo | undefined {
    return lookupModelInfo(this.id, model);
  }

  validateModel(model: string): boolean {
    return modelIsKnown(this.id, model);
  }

  calculateUsage(request: ChatCompletionRequest, result: ChatCompletionResult): TokenUsage {
    return usageFromResult(this.tokens, request, result);
  }

  private classify(status: number, data: unknown): ProviderError {
    const { message, status: code, reason } = readGeminiError(data);

    // Gemini reports a bad API key as a 400, which would otherwise look like the caller's mistake.
    if (
      reason === 'API_KEY_INVALID' ||
      (message !== undefined && /API key not valid/i.test(message))
    ) {
      return new ProviderError('auth', 'Provider rejected our credentials');
    }
    // For example "user location is not supported": a property of our deployment, not of the request.
    if (code === 'FAILED_PRECONDITION') {
      return new ProviderError('unavailable', 'The provider cannot serve this deployment');
    }
    return errorForStatus(status, message);
  }
}
