import { Injectable } from '@nestjs/common';
import { BudgetService } from '../budget/budget.service';
import type { BudgetReservation } from '../budget/budget.service';
import {
  DEFAULT_OUTPUT_TOKEN_ESTIMATE,
  costMicroUsd,
  worstCaseMicroUsd,
} from '../budget/cost-estimator';
import type { ModelPrices } from '../budget/cost-estimator';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { ProviderUnavailableException } from '../common/errors/traffic.exceptions';
import { logEvent } from '../common/logging/structured-logger';
import type { ApiKeyAuth } from '../common/types/gateway-request';
import type { ProviderId } from '../providers/provider.interface';
import { TrafficLimits } from './plan-limits';
import { TokenQuotaService } from './token-quota.service';
import type { TokenReservation } from './token-quota.service';

export interface AdmitInput {
  requestId: string;
  auth: ApiKeyAuth;
  /** Which provider will serve the call; keys the circuit breaker (`provider:gemini:circuit`). */
  providerId: ProviderId;
  prices: ModelPrices;
  /** Tokens in the prompt, counted by the gateway. */
  inputTokens: number;
  /** The caller's max_tokens, if any. */
  maxTokens: number | undefined;
}

/** Everything held for one request between admission and completion. */
export interface Admission {
  providerId: ProviderId;
  prices: ModelPrices;
  tokens: TokenReservation | null;
  budget: BudgetReservation | null;
  /** Null when the tenant's plan has no daily cap (today, every plan), not just when Redis is down. */
  dailyBudget: BudgetReservation | null;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * The traffic controls that need to know the request (its size and its provider), run in the order
 * of the pipeline, after the rate limit guard:
 *
 *   token quota  ->  budget  ->  circuit breaker  ->  [provider call]  ->  settle counters
 *
 * Each step that succeeds takes something (tokens, budget, a trial slot). If a later step refuses,
 * everything already taken is given back, so a refused request leaves no trace in the counters.
 */
@Injectable()
export class TrafficControlService {
  constructor(
    private readonly limits: TrafficLimits,
    private readonly tokenQuota: TokenQuotaService,
    private readonly budget: BudgetService,
    private readonly breaker: CircuitBreakerService,
  ) {}

  /** Runs the checks and takes the reservations. Throws 429, 402 or 503 if the request may not go on. */
  async admit(input: AdmitInput): Promise<Admission> {
    const { auth, requestId } = input;
    const limits = this.limits.forAuth(auth);
    const estimatedTokens = input.inputTokens + (input.maxTokens ?? DEFAULT_OUTPUT_TOKEN_ESTIMATE);
    const worstCase = worstCaseMicroUsd(input.prices, input.inputTokens, input.maxTokens);

    const tokens = await this.tokenQuota.reserve(auth, limits, estimatedTokens, { requestId });

    let budget: BudgetReservation | null = null;
    let dailyBudget: BudgetReservation | null = null;
    try {
      budget = await this.budget.reserveBudget(
        auth.tenantId,
        limits.monthlyBudgetMicroUsd,
        worstCase,
        { requestId },
      );

      // A daily cap is optional (undefined for every plan today); only reserve one when the plan has it.
      if (limits.dailyBudgetMicroUsd !== undefined) {
        dailyBudget = await this.budget.reserveBudget(
          auth.tenantId,
          limits.dailyBudgetMicroUsd,
          worstCase,
          { requestId },
          new Date(),
          'day',
        );
      }

      const decision = await this.breaker.canRequest(input.providerId);
      if (!decision.allowed) {
        logEvent(
          {
            event: 'circuit_open_rejected',
            requestId,
            tenantId: auth.tenantId,
            provider: input.providerId,
            state: decision.state,
            retryAfterSeconds: decision.retryAfterSeconds,
          },
          'warn',
        );
        throw new ProviderUnavailableException(decision.retryAfterSeconds);
      }
    } catch (error) {
      await Promise.all([
        this.tokenQuota.release(tokens),
        this.budget.releaseBudget(budget),
        this.budget.releaseBudget(dailyBudget),
      ]);
      throw error;
    }

    return { providerId: input.providerId, prices: input.prices, tokens, budget, dailyBudget };
  }

  /**
   * The provider answered: replace the estimates with real usage and tell the breaker it is healthy.
   * Returns the cost of the call in micro-dollars (0 on a free tier), so the caller can record it.
   */
  async complete(admission: Admission, usage: Usage): Promise<number> {
    const cost = costMicroUsd(admission.prices, usage.inputTokens, usage.outputTokens);
    await Promise.all([
      this.tokenQuota.commit(admission.tokens, usage.inputTokens + usage.outputTokens),
      this.budget.updateUsage(admission.budget, cost),
      this.budget.updateUsage(admission.dailyBudget, cost),
      this.breaker.recordSuccess(admission.providerId),
    ]);
    return cost;
  }

  /**
   * The call produced no usage: give back what was held.
   *
   * `provider_failure` (timeout, outage, rate limited, our credentials rejected) counts against the
   * provider's circuit. `caller_error` (the provider refused the request itself) means the provider is
   * healthy and answering, so it counts as a success for the circuit.
   */
  async abort(admission: Admission, reason: 'provider_failure' | 'caller_error'): Promise<void> {
    await Promise.all([
      this.tokenQuota.release(admission.tokens),
      this.budget.releaseBudget(admission.budget),
      this.budget.releaseBudget(admission.dailyBudget),
      reason === 'provider_failure'
        ? this.breaker.recordFailure(admission.providerId)
        : this.breaker.recordSuccess(admission.providerId),
    ]);
  }
}
