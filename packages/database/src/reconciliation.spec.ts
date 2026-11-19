import { reconcileTenantUsage } from './reconciliation';
import type { PrismaClient } from '@prisma/client';

describe('reconcileTenantUsage', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  it('reports fully reconciled when all records match 1:1 and costs agree', async () => {
    const mockPrisma = {
      aiRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'req-1',
            tenantId,
            provider: 'GOOGLE',
            model: 'gemini-2.0-flash',
            estimatedCost: '0.00000500',
            status: 'SUCCESS',
            createdAt: new Date(),
          },
          {
            id: 'req-2',
            tenantId,
            provider: 'OPENAI',
            model: 'gpt-4o',
            estimatedCost: '0.00002000',
            status: 'SUCCESS',
            createdAt: new Date(),
          },
          {
            id: 'req-3',
            tenantId,
            provider: 'ANTHROPIC',
            model: 'claude-3-5-sonnet',
            estimatedCost: '0.00000000',
            status: 'FAILED',
            createdAt: new Date(),
          },
        ]),
      },
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'led-1',
            tenantId,
            requestId: 'req-1',
            transactionType: 'AI_USAGE',
            amount: '-0.00000500',
            createdAt: new Date(),
          },
          {
            id: 'led-2',
            tenantId,
            requestId: 'req-2',
            transactionType: 'AI_USAGE',
            amount: '-0.00002000',
            createdAt: new Date(),
          },
        ]),
      },
    } as unknown as Pick<PrismaClient, 'aiRequest' | 'ledgerEntry'>;

    const report = await reconcileTenantUsage(mockPrisma, tenantId);

    expect(report.isReconciled).toBe(true);
    expect(report.discrepancies).toHaveLength(0);
    expect(report.successfulRequests).toBe(2);
    expect(report.failedRequests).toBe(1);
    expect(report.totalRequestCostUsd).toBe(0.000025);
    expect(report.totalLedgerChargesUsd).toBe(0.000025);
  });

  it('detects missing ledger entry for successful request', async () => {
    const mockPrisma = {
      aiRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'req-missing',
            tenantId,
            provider: 'GOOGLE',
            model: 'gemini-2.0-flash',
            estimatedCost: '0.00001000',
            status: 'SUCCESS',
            createdAt: new Date(),
          },
        ]),
      },
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Pick<PrismaClient, 'aiRequest' | 'ledgerEntry'>;

    const report = await reconcileTenantUsage(mockPrisma, tenantId);

    expect(report.isReconciled).toBe(false);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]?.type).toBe('MISSING_LEDGER_ENTRY');
    expect(report.discrepancies[0]?.requestId).toBe('req-missing');
  });

  it('detects amount mismatch between request cost and ledger amount', async () => {
    const mockPrisma = {
      aiRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'req-mismatch',
            tenantId,
            provider: 'GOOGLE',
            model: 'gemini-2.0-flash',
            estimatedCost: '0.00005000',
            status: 'SUCCESS',
            createdAt: new Date(),
          },
        ]),
      },
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'led-diff',
            tenantId,
            requestId: 'req-mismatch',
            transactionType: 'AI_USAGE',
            amount: '-0.00003000',
            createdAt: new Date(),
          },
        ]),
      },
    } as unknown as Pick<PrismaClient, 'aiRequest' | 'ledgerEntry'>;

    const report = await reconcileTenantUsage(mockPrisma, tenantId);

    expect(report.isReconciled).toBe(false);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]?.type).toBe('AMOUNT_MISMATCH');
    expect(report.discrepancies[0]?.requestId).toBe('req-mismatch');
  });

  it('detects unexpected ledger charge on a failed request', async () => {
    const mockPrisma = {
      aiRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'req-failed',
            tenantId,
            provider: 'OPENAI',
            model: 'gpt-4o',
            estimatedCost: '0',
            status: 'FAILED',
            createdAt: new Date(),
          },
        ]),
      },
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'led-bad',
            tenantId,
            requestId: 'req-failed',
            transactionType: 'AI_USAGE',
            amount: '-0.00001000',
            createdAt: new Date(),
          },
        ]),
      },
    } as unknown as Pick<PrismaClient, 'aiRequest' | 'ledgerEntry'>;

    const report = await reconcileTenantUsage(mockPrisma, tenantId);

    expect(report.isReconciled).toBe(false);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]?.type).toBe('UNEXPECTED_FAILED_CHARGE');
    expect(report.discrepancies[0]?.requestId).toBe('req-failed');
  });

  it('detects duplicate charges for the same request', async () => {
    const mockPrisma = {
      aiRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'req-dup',
            tenantId,
            provider: 'GOOGLE',
            model: 'gemini-2.0-flash',
            estimatedCost: '0.00000500',
            status: 'SUCCESS',
            createdAt: new Date(),
          },
        ]),
      },
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'led-dup-1',
            tenantId,
            requestId: 'req-dup',
            transactionType: 'AI_USAGE',
            amount: '-0.00000500',
            createdAt: new Date(),
          },
          {
            id: 'led-dup-2',
            tenantId,
            requestId: 'req-dup',
            transactionType: 'AI_USAGE',
            amount: '-0.00000500',
            createdAt: new Date(),
          },
        ]),
      },
    } as unknown as Pick<PrismaClient, 'aiRequest' | 'ledgerEntry'>;

    const report = await reconcileTenantUsage(mockPrisma, tenantId);

    expect(report.isReconciled).toBe(false);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]?.type).toBe('DUPLICATE_CHARGE');
    expect(report.discrepancies[0]?.requestId).toBe('req-dup');
  });

  it('detects orphaned ledger entry with non-existent request', async () => {
    const mockPrisma = {
      aiRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'led-orphan',
            tenantId,
            requestId: 'req-ghost',
            transactionType: 'AI_USAGE',
            amount: '-0.00000500',
            createdAt: new Date(),
          },
        ]),
      },
    } as unknown as Pick<PrismaClient, 'aiRequest' | 'ledgerEntry'>;

    const report = await reconcileTenantUsage(mockPrisma, tenantId);

    expect(report.isReconciled).toBe(false);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]?.type).toBe('MISSING_REQUEST_RECORD');
    expect(report.discrepancies[0]?.requestId).toBe('req-ghost');
  });

  it('strictly isolates records by tenantId and never queries or leaks data across tenants', async () => {
    const tenantA = 'tenant-a-1111';
    const tenantB = 'tenant-b-2222';

    const mockAiRequestFindMany = jest.fn().mockImplementation(({ where }) => {
      expect(where.tenantId).toBe(tenantA);
      expect(where.tenantId).not.toBe(tenantB);
      return Promise.resolve([
        {
          id: 'req-a',
          tenantId: tenantA,
          provider: 'GOOGLE',
          model: 'gemini-2.0-flash',
          estimatedCost: '0.00000500',
          status: 'SUCCESS',
        },
      ]);
    });

    const mockLedgerEntryFindMany = jest.fn().mockImplementation(({ where }) => {
      expect(where.tenantId).toBe(tenantA);
      return Promise.resolve([
        {
          id: 'led-a',
          tenantId: tenantA,
          requestId: 'req-a',
          transactionType: 'AI_USAGE',
          amount: '-0.00000500',
        },
      ]);
    });

    const mockPrisma = {
      aiRequest: { findMany: mockAiRequestFindMany },
      ledgerEntry: { findMany: mockLedgerEntryFindMany },
    } as unknown as Pick<PrismaClient, 'aiRequest' | 'ledgerEntry'>;

    const reportA = await reconcileTenantUsage(mockPrisma, tenantA);

    expect(reportA.tenantId).toBe(tenantA);
    expect(reportA.isReconciled).toBe(true);
    expect(reportA.totalRequests).toBe(1);
    expect(mockAiRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: tenantA }) }),
    );
    expect(mockLedgerEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: tenantA }) }),
    );
  });
});
