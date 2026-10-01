import { Inject, Injectable, Logger } from '@nestjs/common';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { ProviderUnavailableException } from '../common/errors/traffic.exceptions';
import type { ApiKeyAuth } from '../common/types/gateway-request';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import type { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import type { ChatCompletionResponse } from '../dto/chat-completion.response';
import { ProviderError } from '../providers/provider.interface';
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ModelInfo,
} from '../providers/provider.interface';
import { ProviderRouter } from '../providers/provider.router';
import type { TokenUsage } from '../providers/provider.interface';
import { TokenCounter } from '../tokens/token-counter.service';
import { TrafficControlService } from '../traffic/traffic-control.service';
import { UsageService } from '../usage/usage.service';

export interface PipelineContext {
  requestId: string;
  auth: ApiKeyAuth;
}

/**
 * The request pipeline after authentication: validate the model and limits, route to a provider, call
 * it, record the outcome, and answer in the OpenAI format. It never names a provider: everything it
 * needs (the call, the model limits, the token accounting) comes through the AIProvider interface.
 *
 *   key guard (identity, permission) -> DTO validation -> limits -> provider router
 *   -> provider call -> usage and cost -> request record -> response
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly router: ProviderRouter,
    private readonly usage: UsageService,
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

    const model = await this.router.resolve(dto.model);

    const allowed = context.auth.allowedModels;
    if (allowed && allowed.length > 0) {
      const match = allowed.some((m) =>
        dto.model.toLowerCase() === m.toLowerCase() ||
        dto.model.toLowerCase().includes(m.toLowerCase()) ||
        m.toLowerCase().includes(dto.model.toLowerCase())
      );
      if (!match) {
        throw GatewayErrors.invalidRequest(
          `Model '${dto.model}' is not permitted for your team. Allowed models: ${allowed.join(', ')}`,
          'model',
          'model_not_allowed',
        );
      }
    }

    const request = this.toProviderRequest(dto);
    // Kept in case the call fails: a failed request still tells us how much the caller sent. This is
    // an estimate (an OpenAI vocabulary is only exact for OpenAI models); the provider's own figure
    // replaces it once the call succeeds.
    const estimatedInputTokens = this.tokens.countMessages(dto.model, request.messages);
    this.checkModelLimits(model.info, dto, estimatedInputTokens);

    // Token quota, budget and circuit breaker. Throws 429, 402 or 503 before any provider work.
    const admission = await this.traffic.admit({
      requestId: context.requestId,
      auth: context.auth,
      providerId: model.providerId,
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
      await this.usage.recordFailure({
        auth: context.auth,
        provider: model.providerType,
        model: model.name,
        latencyMs: performance.now() - startedAt,
        requestTokens: estimatedInputTokens,
        errorKind: failure.kind,
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
    const usage = model.provider.calculateUsage(request, result);
    const costMicroUsd = await this.traffic.complete(admission, {
      inputTokens: usage.requestTokens,
      outputTokens: usage.responseTokens,
    });
    // Micro-dollars to dollars, as a decimal string: exact, and 0 on a free tier.
    const estimatedCostUsd = (costMicroUsd / 1_000_000).toFixed(8);
    await this.usage.recordSuccess({
      auth: context.auth,
      provider: model.providerType,
      model: model.name,
      latencyMs,
      usage,
      estimatedCostUsd,
    });

    return this.toResponse(result, usage, estimatedCostUsd);
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

  /** Refuses what the model is known to be unable to handle, without a round trip to the provider. */
  private checkModelLimits(
    info: ModelInfo | undefined,
    dto: ChatCompletionRequestDto,
    estimatedInputTokens: number,
  ): void {
    if (!info) return;
    if (dto.max_tokens !== undefined && dto.max_tokens > info.maxOutputTokens) {
      throw GatewayErrors.invalidRequest(
        `max_tokens must be at most ${info.maxOutputTokens} for ${info.name}.`,
        'max_tokens',
        'max_tokens_exceeded',
      );
    }
    if (estimatedInputTokens > info.contextWindow) {
      throw GatewayErrors.invalidRequest(
        `The conversation is about ${estimatedInputTokens} tokens, more than the ${info.contextWindow} that ${info.name} accepts.`,
        'messages',
        'context_length_exceeded',
      );
    }
  }

  private toResponse(
    result: ChatCompletionResult,
    usage: TokenUsage,
    estimatedCostUsd: string,
  ): ChatCompletionResponse {
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
        // Additive to the OpenAI shape: existing clients that only read the three fields above are
        // unaffected. 0 on a free tier (see budget/cost-estimator.ts).
        estimated_cost: estimatedCostUsd,
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
