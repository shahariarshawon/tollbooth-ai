import { Injectable } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type { LedgerTransactionType } from '@tollbooth/database';

export interface NewLedgerEntry {
  tenantId: string;
  /** The `ai_requests` row this entry is for, when there is one (a manual credit has none). */
  requestId?: string;
  transactionType: LedgerTransactionType;
  /**
   * USD, as a decimal string so no precision is lost. By the schema's convention: negative = a charge
   * to the tenant (`AI_USAGE`), positive = money added to their account (`CREDIT`, `REFUND`).
   */
  amountUsd: string;
  currency?: string;
  description?: string;
}

/**
 * The only place that writes the `ledger_entries` table. Append-only, like the table itself: a
 * correction is a new row (a `REFUND` or `ADJUSTMENT`), never an update to one already written.
 */
@Injectable()
export class UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordLedgerEntry(entry: NewLedgerEntry): Promise<void> {
    await this.prisma.ledgerEntry.create({
      data: {
        tenantId: entry.tenantId,
        requestId: entry.requestId ?? null,
        transactionType: entry.transactionType,
        amount: entry.amountUsd,
        currency: entry.currency ?? 'USD',
        description: entry.description ?? null,
      },
    });
  }
}
