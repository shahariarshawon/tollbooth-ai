import { Inject, Injectable } from '@nestjs/common';
import type { ProviderType } from '@tollbooth/database';
import OpenAI from 'openai';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { ProviderError } from './provider.interface';
import type { AIProvider, ChatCompletionRequest, ChatCompletionResult } from './provider.interface';

@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly type: ProviderType = 'OPENAI';
  private readonly client: OpenAI | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = config.OPENAI_API_KEY
      ? new OpenAI({
          apiKey: config.OPENAI_API_KEY,
          baseURL: config.OPENAI_BASE_URL,
          timeout: config.GATEWAY_PROVIDER_TIMEOUT_MS,
          // Retrying and failing over belong to a later phase; one attempt keeps latency honest.
          maxRetries: 0,
        })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (!this.client) throw new ProviderError('unavailable', 'OpenAI is not configured');

    try {
      const response = await this.client.chat.completions.create({
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
