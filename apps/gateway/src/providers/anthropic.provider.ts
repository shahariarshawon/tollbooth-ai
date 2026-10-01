import { Inject, Injectable } from '@nestjs/common';
import type { ProviderType } from '@tollbooth/database';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { TokenCounter } from '../tokens/token-counter.service';
import { fromAnthropicResponse, readAnthropicError, toAnthropicRequest } from './anthropic.mapper';
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

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic Claude, through the Messages API. Implemented and tested but switched off by default: it
 * serves traffic once the provider row is ACTIVE in the database and ANTHROPIC_API_KEY is set.
 */
@Injectable()
export class AnthropicProvider implements AIProvider {
  readonly id: ProviderId = 'anthropic';
  readonly type: ProviderType = 'ANTHROPIC';

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly tokens: TokenCounter,
  ) {
    this.apiKey = config.ANTHROPIC_API_KEY;
    this.baseUrl = config.ANTHROPIC_BASE_URL.replace(/\/+$/, '');
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
    if (!this.apiKey) throw new ProviderError('unavailable', 'Anthropic is not configured');

    return withProviderRetry(() => this.attempt(request), { maxRetries: this.maxRetries });
  }

  streamCompletion(): Promise<never> {
    return rejectStreaming();
  }

  private async attempt(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const { status, data } = await postJson(`${this.baseUrl}/v1/messages`, {
      headers: { 'x-api-key': this.apiKey!, 'anthropic-version': ANTHROPIC_VERSION },
      body: toAnthropicRequest(request),
      timeoutMs: this.timeoutMs,
    });

    if (status < 200 || status >= 300) {
      throw errorForStatus(status, readAnthropicError(data).message);
    }
    return fromAnthropicResponse(data, request);
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
}
