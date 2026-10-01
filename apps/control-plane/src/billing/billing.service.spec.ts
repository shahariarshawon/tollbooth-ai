import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@tollbooth/database';
import { BillingService } from './billing.service';
import { AuditService } from '../audit/audit.service';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: {
    tenant: { findUnique: jest.Mock; update: jest.Mock };
    tenantSubscription: { findUnique: jest.Mock; update: jest.Mock; upsert: jest.Mock };
    billingPlan: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    ledgerEntry: { aggregate: jest.Mock };
    aiRequest: { aggregate: jest.Mock; groupBy: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: {
    record: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      tenantSubscription: {
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      billingPlan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      ledgerEntry: {
        aggregate: jest.fn(),
      },
      aiRequest: {
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('usage calculation & cost breakdown', () => {
    it('calculates total cost, tokens, and provider breakdown correctly', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-123',
        plan: 'BUSINESS',
        subscription: {
          monthlyBudgetLimit: 500,
          status: 'ACTIVE',
          plan: {
            name: 'Business',
            code: 'BUSINESS',
            monthlyPrice: 199,
            description: 'High-scale production workloads',
            features: ['Unlimited seats', '100k TPM'],
          },
        },
      });

      prisma.ledgerEntry.aggregate.mockResolvedValue({
        _sum: { amount: -70.75 },
      });

      prisma.aiRequest.aggregate.mockResolvedValue({
        _count: { _all: 6300 },
        _sum: { totalTokens: 2_000_000, estimatedCost: 70.75 },
      });

      prisma.aiRequest.groupBy.mockResolvedValue([
        {
          provider: 'google-vertex',
          _count: { _all: 4500 },
          _sum: { totalTokens: 1_200_000, estimatedCost: 45.5 },
        },
        {
          provider: 'openai',
          _count: { _all: 1800 },
          _sum: { totalTokens: 800_000, estimatedCost: 25.25 },
        },
      ]);

      const summary = await service.getSummary('tenant-123');

      expect(summary.currentPlan.name).toBe('Business');
      expect(summary.monthlyLimit).toBe(500);
      expect(summary.currentUsage).toBe(70.75);
      expect(summary.remainingBudget).toBe(429.25);
      expect(summary.totalTokens).toBe(2_000_000);
      expect(summary.providerBreakdown).toHaveLength(2);
      expect(summary.providerBreakdown[0]?.provider).toBe('google-vertex');
      expect(summary.providerBreakdown[0]?.cost).toBe(45.5);
    });

    it('returns 0 remaining budget when spend exceeds monthly limit', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-123',
        plan: 'FREE',
        subscription: {
          monthlyBudgetLimit: 100,
          status: 'ACTIVE',
          plan: { name: 'Free', code: 'FREE', monthlyPrice: 0 },
        },
      });

      prisma.ledgerEntry.aggregate.mockResolvedValue({
        _sum: { amount: -150.0 },
      });

      prisma.aiRequest.aggregate.mockResolvedValue({
        _count: { _all: 10000 },
        _sum: { totalTokens: 5_000_000, estimatedCost: 150.0 },
      });

      prisma.aiRequest.groupBy.mockResolvedValue([]);

      const summary = await service.getSummary('tenant-123');
      expect(summary.currentUsage).toBe(150.0);
      expect(summary.remainingBudget).toBe(0);
    });
  });

  describe('budget enforcement and plan assignment', () => {
    it('updates tenant and subscription budget limits', async () => {
      prisma.tenantSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        tenantId: 'tenant-123',
        monthlyBudgetLimit: 500,
      });
      prisma.tenantSubscription.update.mockResolvedValue({
        id: 'sub-1',
        tenantId: 'tenant-123',
        monthlyBudgetLimit: 750,
      });
      prisma.tenant.update.mockResolvedValue({ id: 'tenant-123' });

      const result = await service.updateLimits('tenant-123', {
        monthlyBudgetLimit: 750,
      });

      expect(prisma.tenantSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-123' },
          data: { monthlyBudgetLimit: 750 },
        }),
      );
      expect(result.monthlyBudgetLimit).toBe(750);
    });

    it('assigns new plan and synchronizes budget limit to tenant', async () => {
      prisma.billingPlan.findUnique.mockResolvedValue({
        id: 'plan-enterprise',
        code: 'ENTERPRISE',
        monthlyBudgetLimit: 2500,
      });
      prisma.$transaction.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-123', planId: 'plan-enterprise' },
        { id: 'tenant-123' },
      ]);

      await service.assignSubscription('tenant-123', {
        planCode: 'ENTERPRISE',
      });

      expect(prisma.billingPlan.findUnique).toHaveBeenCalledWith({
        where: { code: 'ENTERPRISE' },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
