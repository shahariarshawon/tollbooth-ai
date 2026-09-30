import { Inject, Injectable, Logger } from '@nestjs/common';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { ProviderUnavailableException } from '../common/errors/traffic.exceptions';
import type { ApiKeyAuth } from '../common/types/gateway-request';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import type { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import type { ChatCompletionResponse } from '../dto/chat-completion.response';
import { ProviderError } from '../providers/provider.interface';
import type { ChatCompletionRequest, ChatCompletionResult } from '../providers/provider.interface';
import { ProviderService } from '../providers/provider.service';
import { RequestService } from '../requests/request.service';
import type { TokenUsage } from '../requests/request.service';
import { TokenCounter } from '../tokens/token-counter.service';
import { TrafficControlService } from '../traffic/traffic-control.service';

export interface PipelineContext {
  requestId: string;
  auth: ApiKeyAuth;
}

/**
 * The request pipeline after authentication: validate the model and limits, select the provider,
 * call it, record the outcome, and answer in the OpenAI format.
 *
 *   key guard (identity, permission) -> DTO validation -> limits -> model + provider selection
 *   -> provider call -> request record -> response
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly providers: ProviderService,
    private readonly requests: RequestService,
    private readonly tokens: TokenCounter,
    private readonly traffic: TrafficControlService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createChatCompletion(
    context: PipelineContext,
    dto: ChatCompletionRequestDto,
  ): Promise<ChatCompletionResponse> {
    const startedAt = performance.now();

    if (dto.stream === true) {
      throw GatewayErrors.invalidRequest(
        'Streaming is not supported yet. Omit "stream" or set it to false.',
        'stream',
        'streaming_not_supported',
      );
    }
    if (dto.max_tokens !== undefined && dto.max_tokens > this.config.GATEWAY_MAX_TOKENS) {
      throw GatewayErrors.invalidRequest(
        `max_tokens must be at most ${this.config.GATEWAY_MAX_TOKENS}.`,
        'max_tokens',
        'max_tokens_exceeded',
      );
    }

    const model = await this.providers.resolve(dto.model);
    const request = this.toProviderRequest(dto);
    // Kept in case the call fails: a failed request still tells us how much the caller sent.
    const estimatedInputTokens = this.tokens.countMessages(dto.model, request.messages);

    // Token quota, budget and circuit breaker. Throws 429, 402 or 503 before any provider work.
    const admission = await this.traffic.admit({
      requestId: context.requestId,
      auth: context.auth,
      providerType: model.providerType,
      prices: model.prices,
      inputTokens: estimatedInputTokens,
      maxTokens: dto.max_tokens,
    });

    let result: ChatCompletionResult;
    try {
      result = await model.provider.chatCompletion(request);
    } catch (error) {
      const failure = this.asProviderError(error, context);
      await this.traffic.abort(
        admission,
        failure.kind === 'bad_request' ? 'caller_error' : 'provider_failure',
      );
      await this.requests.recordFailure({
        auth: context.auth,
        provider: model.providerType,
        model: model.name,
        latencyMs: performance.now() - startedAt,
        requestTokens: estimatedInputTokens,
        errorMessage:
          failure.kind === 'bad_request' ? `bad_request: ${failure.message}` : failure.kind,
      });
      throw failure.kind === 'bad_request'
        ? GatewayErrors.invalidRequest(
            `The provider rejected the request: ${failure.message}`,
            undefined,
            'provider_rejected_request',
          )
        : new ProviderUnavailableException();
    }

    const latencyMs = performance.now() - startedAt;
    const usage = this.usageOf(result, dto.model, estimatedInputTokens);
    await this.traffic.complete(admission, {
      inputTokens: usage.requestTokens,
      outputTokens: usage.responseTokens,
    });
    await this.requests.recordSuccess({
      auth: context.auth,
      provider: model.providerType,
      model: model.name,
      latencyMs,
      usage,
    });

    return this.toResponse(result, usage);
  }

  private toProviderRequest(dto: ChatCompletionRequestDto): ChatCompletionRequest {
    return {
      model: dto.model,
      messages: dto.messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.name !== undefined && { name: message.name }),
      })),
      ...(dto.temperature !== undefined && { temperature: dto.temperature }),
      ...(dto.top_p !== undefined && { topP: dto.top_p }),
      ...(dto.max_tokens !== undefined && { maxTokens: dto.max_tokens }),
      ...(dto.stop !== undefined && { stop: dto.stop }),
      ...(dto.presence_penalty !== undefined && { presencePenalty: dto.presence_penalty }),
      ...(dto.frequency_penalty !== undefined && { frequencyPenalty: dto.frequency_penalty }),
      ...(dto.user !== undefined && { user: dto.user }),
    };
  }

  /** Provider-reported usage is authoritative; our own count is only the fallback. */
  private usageOf(result: ChatCompletionResult, model: string, estimatedInput: number): TokenUsage {
    const requestTokens = result.usage?.promptTokens ?? estimatedInput;
    const responseTokens =
      result.usage?.completionTokens ??
      result.choices.reduce(
        (sum, choice) => sum + this.tokens.countText(model, choice.message.content ?? ''),
        0,
      );
    return { requestTokens, responseTokens, totalTokens: requestTokens + responseTokens };
  }

  private toResponse(result: ChatCompletionResult, usage: TokenUsage): ChatCompletionResponse {
    return {
      id: result.id,
      object: 'chat.completion',
      created: result.created,
      model: result.model,
      choices: result.choices.map((choice) => ({
        index: choice.index,
        message: choice.message,
        finish_reason: choice.finishReason,
      })),
      usage: {
        prompt_tokens: usage.requestTokens,
        completion_tokens: usage.responseTokens,
        total_tokens: usage.totalTokens,
      },
    };
  }

  /** Providers throw ProviderError; anything else is a bug, which is logged and reported as a provider failure. */
  private asProviderError(error: unknown, context: PipelineContext): ProviderError {
    if (error instanceof ProviderError) return error;
    this.logger.error(
      `Provider threw an unexpected error (requestId=${context.requestId})`,
      error instanceof Error ? error.stack : String(error),
    );
    return new ProviderError('unavailable', 'Unexpected provider failure');
  }
}
