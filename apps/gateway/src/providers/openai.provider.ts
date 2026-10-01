import { Inject, Injectable } from '@nestjs/common';
import type { ProviderType } from '@tollbooth/database';
import OpenAI from 'openai';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { TokenCounter } from '../tokens/token-counter.service';
import { lookupModelInfo, modelIsKnown, PROVIDER_DISPLAY_NAMES } from './model-info';
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

@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly id: ProviderId = 'openai';
  readonly type: ProviderType = 'OPENAI';
  private readonly client: OpenAI | null;
  private readonly maxRetries: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly tokens: TokenCounter,
  ) {
    this.client = config.OPENAI_API_KEY
      ? new OpenAI({
          apiKey: config.OPENAI_API_KEY,
          baseURL: config.OPENAI_BASE_URL,
          timeout: config.GATEWAY_PROVIDER_TIMEOUT_MS,
          // The SDK's own retries are off: GATEWAY_MAX_PROVIDER_RETRIES below retries the same classified
          // failures (timeout, rate limit) the same way as every other provider, instead of the OpenAI
          // SDK's own, differently-tuned policy.
          maxRetries: 0,
        })
      : null;
    this.maxRetries = config.GATEWAY_MAX_PROVIDER_RETRIES;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getProviderName(): string {
    return PROVIDER_DISPLAY_NAMES[this.id];
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

  streamCompletion(): Promise<never> {
    return rejectStreaming();
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (!this.client) throw new ProviderError('unavailable', 'OpenAI is not configured');

    return withProviderRetry(() => this.attempt(request), { maxRetries: this.maxRetries });
  }

  private async attempt(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const client = this.client!;
    try {
      const response = await client.chat.completions.create({
        model: request.model,
        messages: request.messages,
        stream: false,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...(request.topP !== undefined && { top_p: request.topP }),
        ...(request.maxTokens !== undefined && { max_tokens: request.maxTokens }),
        ...(request.stop !== undefined && { stop: request.stop }),
        ...(request.presencePenalty !== undefined && { presence_penalty: request.presencePenalty }),
        ...(request.frequencyPenalty !== undefined && {
          frequency_penalty: request.frequencyPenalty,
        }),
        ...(request.user !== undefined && { user: request.user }),
      });

      return {
        id: response.id,
        created: response.created,
        model: response.model,
        choices: response.choices.map((choice) => ({
          index: choice.index,
          message: { role: 'assistant', content: choice.message.content ?? null },
          finishReason: choice.finish_reason ?? null,
        })),
        ...(response.usage && {
          usage: {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          },
        }),
      };
    } catch (error) {
      throw this.classify(error);
    }
  }

  /** Reduces any SDK failure to a ProviderError, dropping everything but what is safe to keep. */
  private classify(error: unknown): ProviderError {
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return new ProviderError('timeout', 'The provider timed out');
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return new ProviderError('unavailable', 'Could not reach the provider');
    }
    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      if (status === 400 || status === 404 || status === 422) {
        // These describe the caller's own input (for example an unsupported parameter).
        return new ProviderError('bad_request', error.message);
      }
      // Never forward the provider message here: a 401 from OpenAI includes part of our own key.
      if (status === 401 || status === 403)
        return new ProviderError('auth', 'Provider rejected our credentials');
      if (status === 429) return new ProviderError('rate_limited', 'Provider rate limit reached');
    }
    return new ProviderError('unavailable', 'The provider returned an error');
  }
}
