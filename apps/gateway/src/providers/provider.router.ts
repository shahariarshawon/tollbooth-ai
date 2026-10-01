import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type { Prisma, ProviderType } from '@tollbooth/database';
import type { ModelPrices, PricingTier } from '../budget/cost-estimator';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { ProviderUnavailableException } from '../common/errors/traffic.exceptions';
import { logEvent } from '../common/logging/structured-logger';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { AI_PROVIDERS } from './provider.interface';
import type { AIProvider, ModelInfo, ProviderId } from './provider.interface';

const MODEL_SELECT = {
  id: true,
  modelName: true,
  inputTokenPrice: true,
  outputTokenPrice: true,
  isActive: true,
  provider: { select: { id: true, type: true, status: true, configuration: true } },
} satisfies Prisma.AiModelSelect;

type ModelRow = Prisma.AiModelGetPayload<{ select: typeof MODEL_SELECT }>;

/** A model the gateway has agreed to serve, with the provider that will serve it. */
export interface ResolvedModel {
  /** Model name as requested, and as sent to the provider. */
  name: string;
  /** Short provider name (`gemini`, `openai`, `anthropic`); keys the circuit breaker. */
  providerId: ProviderId;
  providerType: ProviderType;
  provider: AIProvider;
  /** USD per 1,000,000 tokens, plus whether the provider account is on a free or paid tier. */
  prices: ModelPrices & { input: Prisma.Decimal; output: Prisma.Decimal; tier: PricingTier };
  /** Limits of the model, when the provider knows them. */
  info: ModelInfo | undefined;
}

/** The provider account tier, kept in the provider row's `configuration` JSON as `{ "tier": "free" }`. */
export function tierOf(configuration: Prisma.JsonValue): PricingTier {
  if (
    typeof configuration === 'object' &&
    configuration !== null &&
    !Array.isArray(configuration)
  ) {
    return configuration['tier'] === 'free' ? 'free' : 'paid';
  }
  return 'paid';
}

/**
 * The AI provider router. Given the model a caller asked for, it decides which provider serves it.
 *
 * The model must exist in the catalogue and be active, and its provider must be enabled in the
 * database, implemented, and configured with credentials. When more than one provider offers the same
 * model name, the configured default provider (GATEWAY_DEFAULT_PROVIDER, Gemini unless changed) goes
 * first.
 *
 * Unknown or inactive models are the caller's mistake (400). A healthy model whose provider cannot serve
 * it is our side of the contract failing (503).
 */
@Injectable()
export class ProviderRouter implements OnModuleInit {
  private readonly byType: Map<string, AIProvider>;
  private readonly defaultProvider: AIProvider | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDERS) providers: AIProvider[],
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.byType = new Map(providers.map((provider) => [provider.type, provider]));
    this.defaultProvider = providers.find(
      (provider) => provider.id === config.GATEWAY_DEFAULT_PROVIDER,
    );
  }

  /** No provider is mandatory, but a gateway whose default provider has no key serves nothing by default. */
  onModuleInit(): void {
    if (this.defaultProvider && !this.defaultProvider.isConfigured()) {
      logEvent(
        {
          event: 'default_provider_not_configured',
          provider: this.defaultProvider.id,
          hint: 'Set the provider API key (Gemini: GOOGLE_AI_API_KEY) or choose another GATEWAY_DEFAULT_PROVIDER.',
        },
        'warn',
      );
    }
  }

  async resolve(modelName: string): Promise<ResolvedModel> {
    const rows = await this.prisma.aiModel.findMany({
      where: { modelName },
      select: MODEL_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) throw GatewayErrors.modelNotFound(modelName);

    const active = rows.filter((row) => row.isActive);
    if (active.length === 0) throw GatewayErrors.modelUnavailable(modelName);

    // Default provider first; otherwise catalogue order. Trying the next one when a call fails is
    // failover, which is a later feature.
    const ordered = [...active].sort(
      (a, b) => Number(this.isDefault(b)) - Number(this.isDefault(a)),
    );

    for (const row of ordered) {
      const provider = this.servingProvider(row);
      if (provider) {
        return {
          name: row.modelName,
          providerId: provider.id,
          providerType: provider.type,
          provider,
          prices: {
            input: row.inputTokenPrice,
            output: row.outputTokenPrice,
            tier: tierOf(row.provider.configuration),
          },
          info: provider.getModelInfo(row.modelName),
        };
      }
    }
    throw new ProviderUnavailableException();
  }

  private isDefault(row: ModelRow): boolean {
    return row.provider.type === this.defaultProvider?.type;
  }

  private servingProvider(row: ModelRow): AIProvider | undefined {
    if (row.provider.status !== 'ACTIVE') return undefined;
    const provider = this.byType.get(row.provider.type);
    return provider?.isConfigured() ? provider : undefined;
  }
}
