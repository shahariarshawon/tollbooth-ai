import { Injectable } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type { AiRequestStatus, ProviderType } from '@tollbooth/database';

export interface NewAiRequest {
  tenantId: string;
  projectId: string;
  apiKeyId: string;
  provider: ProviderType;
  model: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  latencyMs: number;
  /** USD, as a decimal string so no precision is lost on the way to the database. */
  estimatedCostUsd?: string;
  status: AiRequestStatus;
  errorMessage?: string;
}

/** The only place that writes the ai_requests table. */
@Injectable()
export class RequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the new row's id, so a caller (the usage ledger) can link an entry to it. */
  async create(request: NewAiRequest): Promise<string> {
    const created = await this.prisma.aiRequest.create({
      data: {
        tenantId: request.tenantId,
        projectId: request.projectId,
        apiKeyId: request.apiKeyId,
        provider: request.provider,
        model: request.model,
        requestTokens: request.requestTokens,
        responseTokens: request.responseTokens,
        totalTokens: request.totalTokens,
        latencyMs: request.latencyMs,
        estimatedCost: request.estimatedCostUsd ?? '0',
        status: request.status,
        errorMessage: request.errorMessage ?? null,
      },
      select: { id: true },
    });
    return created.id;
  }
}
