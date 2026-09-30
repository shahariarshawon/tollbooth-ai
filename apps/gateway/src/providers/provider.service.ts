import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type { Prisma } from '@tollbooth/database';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { AI_PROVIDERS } from './provider.interface';
import type { AIProvider } from './provider.interface';

const MODEL_SELECT = {
  id: true,
  modelName: true,
  inputTokenPrice: true,
  outputTokenPrice: true,
  isActive: true,
  provider: { select: { id: true, type: true, status: true } },
} satisfies Prisma.AiModelSelect;

type ModelRow = Prisma.AiModelGetPayload<{ select: typeof MODEL_SELECT }>;

/** A model the gateway has agreed to serve, with the provider that will serve it. */
export interface ResolvedModel {
  /** Model name as requested, and as sent to the provider. */
  name: string;
  providerType: AIProvider['type'];
  provider: AIProvider;
  /** USD per 1,000,000 tokens. Carried through for the billing phase; nothing computes cost yet. */
  prices: { input: Prisma.Decimal; output: Prisma.Decimal };
}

@Injectable()
export class ProviderService {
  private readonly byType: Map<string, AIProvider>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDERS) providers: AIProvider[],
  ) {
    this.byType = new Map(providers.map((provider) => [provider.type, provider]));
  }

  /**
   * Pipeline steps 5 and 6 (model validation and provider selection). The model must exist in the
   * catalogue and be active, and its provider must be enabled, implemented and configured.
   *
   * Unknown or inactive models are the caller's mistake (400). A healthy model whose provider cannot
   * serve it is our side of the contract failing (503).
   */
  async resolve(modelName: string): Promise<ResolvedModel> {
    const rows = await this.prisma.aiModel.findMany({
      where: { modelName },
      select: MODEL_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) throw GatewayErrors.modelNotFound(modelName);

    const active = rows.filter((row) => row.isActive);
    if (active.length === 0) throw GatewayErrors.modelUnavailable(modelName);

    // First servable candidate wins. Trying the next one on failure is failover, added later.
    for (const row of active) {
      const provider = this.servingProvider(row);
      if (provider) {
        return {
          name: row.modelName,
          providerType: provider.type,
          provider,
          prices: { input: row.inputTokenPrice, output: row.outputTokenPrice },
        };
      }
    }
    throw GatewayErrors.providerUnavailable();
  }

  private servingProvider(row: ModelRow): AIProvider | undefined {
    if (row.provider.status !== 'ACTIVE') return undefined;
    const provider = this.byType.get(row.provider.type);
    return provider?.isConfigured() ? provider : undefined;
  }
}
