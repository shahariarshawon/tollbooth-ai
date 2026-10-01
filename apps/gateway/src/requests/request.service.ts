import { Injectable, Logger } from '@nestjs/common';
import type { ProviderType } from '@tollbooth/database';
import type { ApiKeyAuth } from '../common/types/gateway-request';
import type { TokenUsage } from '../providers/provider.interface';
import { RequestRepository } from './request.repository';

export type { TokenUsage };

export interface RecordInput {
  auth: ApiKeyAuth;
  provider: ProviderType;
  model: string;
  latencyMs: number;
}

/**
 * Pipeline step 9: keep a record of every call that reached a provider. The record is the source for
 * usage tracking and for the usage ledger (see `../usage`).
 *
 * A failure to save must not turn a successful completion into an error for the caller, who has
 * already been served (and charged by the provider). It is logged loudly instead, and `undefined` is
 * returned so a caller that wants to link something to this record (the usage ledger) knows there is
 * nothing to link to.
 */
@Injectable()
export class RequestService {
  private readonly logger = new Logger(RequestService.name);

  constructor(private readonly repository: RequestRepository) {}

  /** Returns the new `ai_requests` row's id, or undefined if the save itself failed. */
  recordSuccess(
    input: RecordInput & { usage: TokenUsage; estimatedCostUsd: string },
  ): Promise<string | undefined> {
    return this.save(input, {
      ...input.usage,
      status: 'SUCCESS',
      estimatedCostUsd: input.estimatedCostUsd,
    });
  }

  recordFailure(
    input: RecordInput & { requestTokens: number; errorMessage: string },
  ): Promise<string | undefined> {
    return this.save(input, {
      requestTokens: input.requestTokens,
      responseTokens: 0,
      totalTokens: input.requestTokens,
      status: 'FAILED',
      errorMessage: input.errorMessage.slice(0, 500),
    });
  }

  private async save(
    input: RecordInput,
    outcome: TokenUsage & {
      status: 'SUCCESS' | 'FAILED';
      errorMessage?: string;
      estimatedCostUsd?: string;
    },
  ): Promise<string | undefined> {
    try {
      return await this.repository.create({
        tenantId: input.auth.tenantId,
        projectId: input.auth.projectId,
        apiKeyId: input.auth.apiKeyId,
        provider: input.provider,
        model: input.model,
        latencyMs: Math.round(input.latencyMs),
        ...outcome,
      });
    } catch (error) {
      this.logger.error(
        `Failed to save request record (tenantId=${input.auth.tenantId}, model=${input.model})`,
        error instanceof Error ? error.stack : String(error),
      );
      return undefined;
    }
  }
}
