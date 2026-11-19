import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { GatewayCacheService } from '../cache/gateway-cache.service';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { ProviderUnavailableException } from '../common/errors/traffic.exceptions';
import { logEvent } from '../common/logging/structured-logger';
import type { ApiKeyAuth, GatewayRequest } from '../common/types/gateway-request';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import type { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import type { ChatCompletionResponse } from '../dto/chat-completion.response';
import { aiFailoverTotal, aiStreamingRequestsTotal } from '../metrics/metrics';
import { ProviderError } from '../providers/provider.interface';
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ModelInfo,
  TokenUsage,
} from '../providers/provider.interface';
import { ProviderRouter } from '../providers/provider.router';
import { TokenCounter } from '../tokens/token-counter.service';
import { TrafficControlService } from '../traffic/traffic-control.service';
import { UsageService } from '../usage/usage.service';
import { isModelPermitted } from './model-authorization';

export interface PipelineContext {
  requestId: string;
  auth: ApiKeyAuth;
}

/**
 * The request pipeline after authentication: validate the model and limits, check cache,
 * route to a provider with automatic failover, record usage, and answer in OpenAI format.
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly router: ProviderRouter,
    private readonly usage: UsageService,
    private readonly tokens: TokenCounter,
    private readonly traffic: TrafficControlService,
    private readonly cache: GatewayCacheService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createChatCompletion(
    context: PipelineContext,
    dto: ChatCompletionRequestDto,
  ): Promise<ChatCompletionResponse> {
    const startedAt = performance.now();

    if (dto.stream === true) {
      throw GatewayErrors.invalidRequest(
        'Streaming must be requested via streaming handler.',
        'stream',
        'streaming_invalid_mode',
      );
    }
    if (dto.max_tokens !== undefined && dto.max_tokens > this.config.GATEWAY_MAX_TOKENS) {
      throw GatewayErrors.invalidRequest(
        `max_tokens must be at most ${this.config.GATEWAY_MAX_TOKENS}.`,
        'max_tokens',
        'max_tokens_exceeded',
      );
    }

    const allowed = context.auth.allowedModels;
    if (!isModelPermitted(dto.model, allowed)) {
      throw GatewayErrors.invalidRequest(
        `Model '${dto.model}' is not permitted for your team. Allowed models: ${allowed!.join(', ')}`,
        'model',
        'model_not_allowed',
      );
    }

    // Tenant-isolated cache lookup
    const cached = await this.cache.get(context.auth.tenantId, dto);
    if (cached) {
      return cached;
    }

    const primary = await this.router.resolve(dto.model);
    const allCandidates =
      typeof this.router.resolveCandidates === 'function'
        ? await this.router.resolveCandidates(dto.model)
        : [primary];
    const candidates = allCandidates.length > 0 ? allCandidates : [primary];
    const allowedCandidates = candidates.filter((c) => isModelPermitted(c.name, allowed));
    if (allowedCandidates.length === 0) {
      throw new ProviderUnavailableException();
    }

    const request = this.toProviderRequest(dto);
    const estimatedInputTokens = this.tokens.countMessages(dto.model, request.messages);

    for (let i = 0; i < allowedCandidates.length; i++) {
      const model = allowedCandidates[i]!;

      try {
        this.checkModelLimits(model.info, dto, estimatedInputTokens);
      } catch (err) {
        if (i === allowedCandidates.length - 1) throw err;
        continue;
      }

      let admission;
      try {
        admission = await this.traffic.admit({
          requestId: context.requestId,
          auth: context.auth,
          providerId: model.providerId,
          prices: model.prices,
          inputTokens: estimatedInputTokens,
          maxTokens: dto.max_tokens,
        });
      } catch (err) {
        if (i === allowedCandidates.length - 1) throw err;
        continue;
      }

      try {
        const result = await model.provider.chatCompletion(request);
        const latencyMs = performance.now() - startedAt;
        const usage = model.provider.calculateUsage(request, result);
        const costMicroUsd = await this.traffic.complete(admission, {
          inputTokens: usage.requestTokens,
          outputTokens: usage.responseTokens,
        });
        const estimatedCostUsd = (costMicroUsd / 1_000_000).toFixed(8);
        const pricingDescription =
          model.prices.tier === 'free'
            ? '(free tier)'
            : `(${usage.requestTokens}in @ $${model.prices.input}/M, ${usage.responseTokens}out @ $${model.prices.output}/M)`;

        await this.usage.recordSuccess({
          auth: context.auth,
          provider: model.providerType,
          model: model.name,
          latencyMs,
          usage,
          estimatedCostUsd,
          correlationId: context.requestId,
          pricingDescription,
        });

        const response = this.toResponse(result, usage, estimatedCostUsd);
        await this.cache.set(context.auth.tenantId, dto, response);
        return response;
      } catch (error) {
        const failure = this.asProviderError(error, context);
        await this.traffic.abort(
          admission,
          failure.kind === 'bad_request' ? 'caller_error' : 'provider_failure',
        );

        if (failure.kind === 'bad_request') {
          await this.usage.recordFailure({
            auth: context.auth,
            provider: model.providerType,
            model: model.name,
            latencyMs: performance.now() - startedAt,
            requestTokens: estimatedInputTokens,
            errorKind: failure.kind,
            errorMessage: `bad_request: ${failure.message}`,
            correlationId: context.requestId,
          });
          throw GatewayErrors.invalidRequest(
            `The provider rejected the request: ${failure.message}`,
            undefined,
            'provider_rejected_request',
          );
        }

        const next = allowedCandidates[i + 1];
        if (next) {
          aiFailoverTotal.inc({
            from_provider: model.providerId,
            to_provider: next.providerId,
            reason: failure.kind,
          });
          logEvent(
            {
              event: 'provider_failover',
              requestId: context.requestId,
              tenantId: context.auth.tenantId,
              fromProvider: model.providerId,
              toProvider: next.providerId,
              reason: failure.kind,
            },
            'warn',
          );
          continue;
        }

        await this.usage.recordFailure({
          auth: context.auth,
          provider: model.providerType,
          model: model.name,
          latencyMs: performance.now() - startedAt,
          requestTokens: estimatedInputTokens,
          errorKind: failure.kind,
          errorMessage: failure.kind,
          correlationId: context.requestId,
        });
        throw new ProviderUnavailableException();
      }
    }
    throw new ProviderUnavailableException();
  }

  async streamChatCompletion(
    context: PipelineContext,
    dto: ChatCompletionRequestDto,
    request: GatewayRequest,
    response: Response,
  ): Promise<void> {
    const startedAt = performance.now();
    aiStreamingRequestsTotal.inc({ provider: 'gateway', model: dto.model, status: 'started' });

    if (dto.max_tokens !== undefined && dto.max_tokens > this.config.GATEWAY_MAX_TOKENS) {
      throw GatewayErrors.invalidRequest(
        `max_tokens must be at most ${this.config.GATEWAY_MAX_TOKENS}.`,
        'max_tokens',
        'max_tokens_exceeded',
      );
    }

    const allowed = context.auth.allowedModels;
    if (!isModelPermitted(dto.model, allowed)) {
      throw GatewayErrors.invalidRequest(
        `Model '${dto.model}' is not permitted for your team. Allowed models: ${allowed!.join(', ')}`,
        'model',
        'model_not_allowed',
      );
    }

    const primary = await this.router.resolve(dto.model);
    const allCandidates =
      typeof this.router.resolveCandidates === 'function'
        ? await this.router.resolveCandidates(dto.model)
        : [primary];
    const candidates = allCandidates.length > 0 ? allCandidates : [primary];
    const allowedCandidates = candidates.filter((c) => isModelPermitted(c.name, allowed));
    if (allowedCandidates.length === 0) {
      throw new ProviderUnavailableException();
    }

    const providerRequest = this.toProviderRequest(dto);
    const estimatedInputTokens = this.tokens.countMessages(dto.model, providerRequest.messages);

    const abortController = new AbortController();
    let clientDisconnected = false;

    const cleanupClient = () => {
      clientDisconnected = true;
      abortController.abort();
    };
    request.on('close', cleanupClient);
    response.on('close', cleanupClient);

    for (let i = 0; i < allowedCandidates.length; i++) {
      const model = allowedCandidates[i]!;

      try {
        this.checkModelLimits(model.info, dto, estimatedInputTokens);
      } catch (err) {
        if (i === allowedCandidates.length - 1) throw err;
        continue;
      }

      let admission;
      try {
        admission = await this.traffic.admit({
          requestId: context.requestId,
          auth: context.auth,
          providerId: model.providerId,
          prices: model.prices,
          inputTokens: estimatedInputTokens,
          maxTokens: dto.max_tokens,
        });
      } catch (err) {
        if (i === allowedCandidates.length - 1) throw err;
        continue;
      }

      let chunksEmitted = 0;
      let accumulatedOutput = '';
      let reportedPromptTokens = estimatedInputTokens;
      let reportedOutputTokens = 0;

      try {
        const stream = model.provider.streamCompletion(providerRequest, abortController.signal);

        if (!response.headersSent) {
          response.setHeader('Content-Type', 'text/event-stream');
          response.setHeader('Cache-Control', 'no-cache, no-transform');
          response.setHeader('Connection', 'keep-alive');
          response.setHeader('X-Accel-Buffering', 'no');
          response.flushHeaders?.();
        }

        for await (const chunk of stream) {
          if (clientDisconnected || abortController.signal.aborted) {
            break;
          }

          chunksEmitted++;
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            accumulatedOutput += content;
          }
          if (chunk.usage) {
            reportedPromptTokens = chunk.usage.promptTokens;
            reportedOutputTokens = chunk.usage.completionTokens;
          }

          response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        if (!clientDisconnected) {
          response.write('data: [DONE]\n\n');
          response.end();
        }

        const finalOutputTokens =
          reportedOutputTokens > 0
            ? reportedOutputTokens
            : Math.max(1, this.tokens.countText(dto.model, accumulatedOutput));
        const latencyMs = performance.now() - startedAt;

        const costMicroUsd = await this.traffic.complete(admission, {
          inputTokens: reportedPromptTokens,
          outputTokens: finalOutputTokens,
        });
        const estimatedCostUsd = (costMicroUsd / 1_000_000).toFixed(8);
        const pricingDescription =
          model.prices.tier === 'free'
            ? '(free tier)'
            : `(${reportedPromptTokens}in @ $${model.prices.input}/M, ${finalOutputTokens}out @ $${model.prices.output}/M)`;

        await this.usage.recordSuccess({
          auth: context.auth,
          provider: model.providerType,
          model: model.name,
          latencyMs,
          usage: {
            requestTokens: reportedPromptTokens,
            responseTokens: finalOutputTokens,
            totalTokens: reportedPromptTokens + finalOutputTokens,
          },
          estimatedCostUsd,
          correlationId: context.requestId,
          pricingDescription,
        });

        aiStreamingRequestsTotal.inc({
          provider: model.providerId,
          model: model.name,
          status: clientDisconnected ? 'interrupted' : 'completed',
        });
        return;
      } catch (error) {
        if (chunksEmitted > 0) {
          this.logger.warn(
            `Streaming interrupted after ${chunksEmitted} chunks (requestId=${context.requestId})`,
          );
          if (!clientDisconnected && !response.writableEnded) {
            response.end();
          }
          const finalOutputTokens = Math.max(
            1,
            this.tokens.countText(dto.model, accumulatedOutput),
          );
          await this.traffic.complete(admission, {
            inputTokens: reportedPromptTokens,
            outputTokens: finalOutputTokens,
          });
          return;
        }

        const failure = this.asProviderError(error, context);
        await this.traffic.abort(
          admission,
          failure.kind === 'bad_request' ? 'caller_error' : 'provider_failure',
        );

        if (failure.kind === 'bad_request') {
          throw GatewayErrors.invalidRequest(
            `The provider rejected the request: ${failure.message}`,
            undefined,
            'provider_rejected_request',
          );
        }

        const next = allowedCandidates[i + 1];
        if (next) {
          aiFailoverTotal.inc({
            from_provider: model.providerId,
            to_provider: next.providerId,
            reason: failure.kind,
          });
          continue;
        }

        await this.usage.recordFailure({
          auth: context.auth,
          provider: model.providerType,
          model: model.name,
          latencyMs: performance.now() - startedAt,
          requestTokens: estimatedInputTokens,
          errorKind: failure.kind,
          errorMessage: failure.kind,
          correlationId: context.requestId,
        });
        throw new ProviderUnavailableException();
      }
    }
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
        estimated_cost: estimatedCostUsd,
      },
    };
  }

  private asProviderError(error: unknown, context: PipelineContext): ProviderError {
    if (error instanceof ProviderError) return error;
    this.logger.error(
      `Provider threw an unexpected error (requestId=${context.requestId})`,
      error instanceof Error ? error.stack : String(error),
    );
    return new ProviderError('unavailable', 'Unexpected provider failure');
  }
}
