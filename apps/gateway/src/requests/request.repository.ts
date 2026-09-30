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
  status: AiRequestStatus;
  errorMessage?: string;
}

/** The only place that writes the ai_requests table. */
@Injectable()
export class RequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(request: NewAiRequest): Promise<void> {
    await this.prisma.aiRequest.create({
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
        status: request.status,
        errorMessage: request.errorMessage ?? null,
        // estimatedCost keeps its default of 0; the billing phase fills it in.
      },
    });
  }
}
