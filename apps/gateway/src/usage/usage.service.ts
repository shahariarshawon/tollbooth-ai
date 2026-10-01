import { Injectable, Logger } from '@nestjs/common';
import type { LedgerTransactionType } from '@tollbooth/database';
import type { RecordInput } from '../requests/request.service';
import { RequestService } from '../requests/request.service';
import type { TokenUsage } from '../requests/request.service';
import { UsageRepository } from './usage.repository';

/**
 * Pipeline step 9, in full: record what happened (`ai_requests`, via `RequestService`, unchanged from
 * earlier phases) and, for a successful call, what it cost (`ledger_entries`, new in Phase 7).
 *
 * Token counting (`TokenCounter`) and cost calculation (`budget/cost-estimator.ts`) already happen
 * upstream, in the provider and in `TrafficControlService.complete`, the same provider-independent way
 * for every provider; this service only files the two records of the outcome. It is the one thing
 * `GatewayService` calls after a request finishes, so it never has to remember to write both.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly requests: RequestService,
    private readonly ledger: UsageRepository,
  ) {}

  /**
   * A successful call: the `ai_requests` row, then an `AI_USAGE` ledger entry for what it actually cost
   * (0 on a free tier — recorded all the same, so free-tier usage leaves the same audit trail as paid
   * usage; see Task 8). The ledger entry is still written even if the `ai_requests` row failed to save,
   * just without a `requestId` to link, because the money (or free-tier usage) still happened.
   */
  async recordSuccess(
    input: RecordInput & { usage: TokenUsage; estimatedCostUsd: string },
  ): Promise<void> {
    const requestId = await this.requests.recordSuccess(input);
    await this.writeLedgerEntry({
      tenantId: input.auth.tenantId,
      requestId,
      transactionType: 'AI_USAGE',
      amountUsd: chargeAmount(input.estimatedCostUsd),
      description: `${input.provider} ${input.model}`,
    });
  }

  /**
   * A failed call: recorded for the audit trail. Nothing is charged, because `TrafficControlService`
   * already released whatever budget was held for it before this is called, so there is no ledger entry.
   */
  async recordFailure(
    input: RecordInput & { requestTokens: number; errorMessage: string },
  ): Promise<void> {
    await this.requests.recordFailure(input);
  }

  /**
   * A manual change to a tenant's ledger: a credit, an adjustment, or a refund. Not reachable from any
   * endpoint yet — Phase 7 is request-driven usage tracking, not a billing or credit API — but the
   * ledger itself supports every transaction type the schema defines, for that to be added later without
   * a schema or repository change.
   */
  recordAdjustment(input: {
    tenantId: string;
    transactionType: Exclude<LedgerTransactionType, 'AI_USAGE'>;
    amountUsd: string;
    description?: string;
  }): Promise<void> {
    return this.writeLedgerEntry(input);
  }

  private async writeLedgerEntry(entry: {
    tenantId: string;
    requestId?: string;
    transactionType: LedgerTransactionType;
    amountUsd: string;
    description?: string;
  }): Promise<void> {
    try {
      await this.ledger.recordLedgerEntry(entry);
    } catch (error) {
      // The caller has already been served; a bookkeeping failure is logged loudly, not raised. The
      // Redis budget counters (the fast path) already reflect the spend regardless of this write.
      this.logger.error(
        `Failed to write ledger entry (tenantId=${entry.tenantId}, type=${entry.transactionType})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

/** `"0.00000500"` -> `"-0.00000500"`; `"0"` (and `"0.00000000"`) stay `"0"`, by the ledger's sign convention. */
function chargeAmount(costUsd: string): string {
  return Number(costUsd) === 0 ? '0' : `-${costUsd.replace(/^-/, '')}`;
}
