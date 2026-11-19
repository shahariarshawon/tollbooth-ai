import type { PrismaClient } from '@prisma/client';

export type DiscrepancyType =
  | 'MISSING_LEDGER_ENTRY'
  | 'MISSING_REQUEST_RECORD'
  | 'AMOUNT_MISMATCH'
  | 'UNEXPECTED_FAILED_CHARGE'
  | 'DUPLICATE_CHARGE';

export interface UsageDiscrepancy {
  type: DiscrepancyType;
  tenantId: string;
  requestId?: string;
  ledgerEntryId?: string;
  details: string;
  requestCostUsd?: string;
  ledgerAmountUsd?: string;
}

export interface ReconciliationReport {
  tenantId: string;
  fromDate?: Date;
  toDate?: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLedgerEntries: number;
  totalRequestCostUsd: number;
  totalLedgerChargesUsd: number;
  discrepancies: UsageDiscrepancy[];
  isReconciled: boolean;
}

export interface ReconcileOptions {
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Reconciles operational AI requests with financial ledger entries for a tenant.
 * Audits 1:1 correspondence, exact cost matches, absence of charges for failed calls,
 * and detects duplicate or orphaned ledger entries.
 */
export async function reconcileTenantUsage(
  prisma: Pick<PrismaClient, 'aiRequest' | 'ledgerEntry'>,
  tenantId: string,
  options: ReconcileOptions = {},
): Promise<ReconciliationReport> {
  const dateFilter =
    options.fromDate || options.toDate
      ? {
          createdAt: {
            ...(options.fromDate ? { gte: options.fromDate } : {}),
            ...(options.toDate ? { lte: options.toDate } : {}),
          },
        }
      : {};

  const [aiRequests, ledgerEntries] = await Promise.all([
    prisma.aiRequest.findMany({
      where: {
        tenantId,
        ...dateFilter,
      },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        ...dateFilter,
      },
    }),
  ]);

  const discrepancies: UsageDiscrepancy[] = [];
  const requestMap = new Map<string, (typeof aiRequests)[number]>();
  for (const req of aiRequests) {
    requestMap.set(req.id, req);
  }

  // Group ledger entries by requestId
  const ledgerByRequest = new Map<string, typeof ledgerEntries>();
  let totalLedgerChargesUsd = 0;

  for (const entry of ledgerEntries) {
    if (entry.transactionType === 'AI_USAGE') {
      totalLedgerChargesUsd += Math.abs(Number(entry.amount));
    }
    if (entry.requestId) {
      const existing = ledgerByRequest.get(entry.requestId) ?? [];
      existing.push(entry);
      ledgerByRequest.set(entry.requestId, existing);
    }
  }

  let totalRequestCostUsd = 0;
  let successfulRequests = 0;
  let failedRequests = 0;

  for (const req of aiRequests) {
    const cost = Number(req.estimatedCost);
    totalRequestCostUsd += cost;

    if (req.status === 'SUCCESS') {
      successfulRequests++;
      const entries = ledgerByRequest.get(req.id) ?? [];
      const usageEntries = entries.filter((e) => e.transactionType === 'AI_USAGE');

      if (usageEntries.length === 0) {
        discrepancies.push({
          type: 'MISSING_LEDGER_ENTRY',
          tenantId,
          requestId: req.id,
          requestCostUsd: req.estimatedCost.toString(),
          details: `Successful request ${req.id} (${req.provider} ${req.model}) has no corresponding AI_USAGE ledger entry.`,
        });
      } else if (usageEntries.length > 1) {
        discrepancies.push({
          type: 'DUPLICATE_CHARGE',
          tenantId,
          requestId: req.id,
          requestCostUsd: req.estimatedCost.toString(),
          details: `Request ${req.id} has ${usageEntries.length} separate AI_USAGE ledger charges.`,
        });
      } else {
        const entry = usageEntries[0]!;
        // Ledger charges are recorded as negative values: -0.000005
        const chargedAmount = Math.abs(Number(entry.amount));
        if (Math.abs(chargedAmount - cost) > 0.00000001) {
          discrepancies.push({
            type: 'AMOUNT_MISMATCH',
            tenantId,
            requestId: req.id,
            ledgerEntryId: entry.id,
            requestCostUsd: req.estimatedCost.toString(),
            ledgerAmountUsd: entry.amount.toString(),
            details: `Cost mismatch for request ${req.id}: request estimated ${cost} USD, ledger recorded ${chargedAmount} USD.`,
          });
        }
      }
    } else {
      failedRequests++;
      const entries = ledgerByRequest.get(req.id) ?? [];
      const usageEntries = entries.filter((e) => e.transactionType === 'AI_USAGE');
      if (usageEntries.length > 0) {
        discrepancies.push({
          type: 'UNEXPECTED_FAILED_CHARGE',
          tenantId,
          requestId: req.id,
          ledgerEntryId: usageEntries[0]?.id,
          ledgerAmountUsd: usageEntries[0]?.amount.toString(),
          details: `Failed request ${req.id} has an unexpected AI_USAGE charge of ${usageEntries[0]?.amount} USD.`,
        });
      }
    }
  }

  // Audit for orphan ledger entries referencing non-existent requests
  for (const entry of ledgerEntries) {
    if (entry.transactionType === 'AI_USAGE' && entry.requestId) {
      if (!requestMap.has(entry.requestId)) {
        discrepancies.push({
          type: 'MISSING_REQUEST_RECORD',
          tenantId,
          requestId: entry.requestId,
          ledgerEntryId: entry.id,
          ledgerAmountUsd: entry.amount.toString(),
          details: `Ledger entry ${entry.id} references request ${entry.requestId} which does not exist in ai_requests.`,
        });
      }
    }
  }

  return {
    tenantId,
    fromDate: options.fromDate,
    toDate: options.toDate,
    totalRequests: aiRequests.length,
    successfulRequests,
    failedRequests,
    totalLedgerEntries: ledgerEntries.length,
    totalRequestCostUsd: Number(totalRequestCostUsd.toFixed(8)),
    totalLedgerChargesUsd: Number(totalLedgerChargesUsd.toFixed(8)),
    discrepancies,
    isReconciled: discrepancies.length === 0,
  };
}
