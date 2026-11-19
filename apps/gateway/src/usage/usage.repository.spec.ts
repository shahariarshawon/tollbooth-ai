import { UsageRepository } from './usage.repository';
import type { PrismaService } from '@tollbooth/database';
import type { ApiKeyAuth } from '../common/types/gateway-request';

const auth: ApiKeyAuth = {
  tenantId: 'tenant-uuid-1',
  projectId: 'proj-uuid-1',
  apiKeyId: 'key-uuid-1',
  plan: 'STARTUP',
  permissions: ['chat:completions'],
  rateLimit: null,
};

describe('UsageRepository Transactional Outbox', () => {
  let mockTx: {
    aiRequest: { create: jest.Mock };
    ledgerEntry: { create: jest.Mock };
    outboxEvent: { create: jest.Mock };
  };
  let mockPrisma: {
    $transaction: jest.Mock;
    ledgerEntry: { create: jest.Mock };
  };
  let repository: UsageRepository;

  beforeEach(() => {
    mockTx = {
      aiRequest: { create: jest.fn().mockResolvedValue({ id: 'ai-req-123' }) },
      ledgerEntry: { create: jest.fn().mockResolvedValue({ id: 'led-123' }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'out-123' }) },
    };
    mockPrisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(mockTx)),
      ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
    };
    repository = new UsageRepository(mockPrisma as unknown as PrismaService);
  });

  describe('recordSuccessTransaction', () => {
    it('atomically commits request record, ledger entry, and pending outbox event', async () => {
      const result = await repository.recordSuccessTransaction({
        auth,
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
        latencyMs: 145.2,
        usage: { requestTokens: 20, responseTokens: 30, totalTokens: 50, isEstimatedTokens: false },
        estimatedCostUsd: '0.00001500',
        correlationId: 'req_client_abc',
        pricingDescription: '(20in @ $0.15/M, 30out @ $0.60/M)',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      expect(mockTx.aiRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-uuid-1',
          projectId: 'proj-uuid-1',
          apiKeyId: 'key-uuid-1',
          provider: 'GOOGLE',
          model: 'gemini-2.0-flash',
          requestTokens: 20,
          responseTokens: 30,
          totalTokens: 50,
          latencyMs: 145,
          estimatedCost: '0.00001500',
          status: 'SUCCESS',
        }),
        select: { id: true },
      });

      expect(mockTx.ledgerEntry.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-uuid-1',
          requestId: 'ai-req-123',
          transactionType: 'AI_USAGE',
          amount: '-0.00001500',
          currency: 'USD',
          description: 'GOOGLE gemini-2.0-flash (20in @ $0.15/M, 30out @ $0.60/M)',
        },
      });

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-uuid-1',
          topic: 'usage.completed',
          eventKey: 'tenant-uuid-1',
          eventType: 'USAGE_COMPLETED',
          status: 'PENDING',
          payload: expect.objectContaining({
            requestId: 'ai-req-123',
            correlationId: 'req_client_abc',
            tenantId: 'tenant-uuid-1',
            provider: 'GOOGLE',
            model: 'gemini-2.0-flash',
            totalTokens: 50,
            estimatedCost: '0.00001500',
            isEstimatedTokens: false,
          }),
        }),
      });

      expect(result.requestId).toBe('ai-req-123');
      expect(result.outboxEventId).toBeDefined();
      expect(result.event.totalTokens).toBe(50);
    });
  });

  describe('recordFailureTransaction', () => {
    it('records failed request and pending provider.failed outbox event for real provider errors', async () => {
      const result = await repository.recordFailureTransaction({
        auth,
        provider: 'ANTHROPIC',
        model: 'claude-3-5-sonnet',
        latencyMs: 5000,
        requestTokens: 40,
        errorKind: 'timeout',
        errorMessage: 'Provider timed out after 5000ms',
        correlationId: 'req_correl_fail',
      });

      expect(mockTx.aiRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-uuid-1',
          provider: 'ANTHROPIC',
          model: 'claude-3-5-sonnet',
          requestTokens: 40,
          responseTokens: 0,
          totalTokens: 40,
          estimatedCost: '0',
          status: 'FAILED',
        }),
        select: { id: true },
      });

      // Failed requests must never write a financial ledger charge
      expect(mockTx.ledgerEntry.create).not.toHaveBeenCalled();

      // Real provider failures must create outbox event for provider.failed
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-uuid-1',
          topic: 'provider.failed',
          eventKey: 'tenant-uuid-1',
          eventType: 'PROVIDER_FAILED',
          status: 'PENDING',
          payload: expect.objectContaining({
            requestId: 'ai-req-123',
            correlationId: 'req_correl_fail',
            errorKind: 'timeout',
          }),
        }),
      });

      expect(result.requestId).toBe('ai-req-123');
      expect(result.outboxEventId).toBeDefined();
    });

    it('records failed request but skips outbox event and ledger for bad_request (caller error)', async () => {
      const result = await repository.recordFailureTransaction({
        auth,
        provider: 'OPENAI',
        model: 'gpt-4o',
        latencyMs: 45,
        requestTokens: 10,
        errorKind: 'bad_request',
        errorMessage: 'Invalid prompt parameter',
      });

      expect(mockTx.aiRequest.create).toHaveBeenCalledTimes(1);
      expect(mockTx.ledgerEntry.create).not.toHaveBeenCalled();
      expect(mockTx.outboxEvent.create).not.toHaveBeenCalled();
      expect(result.outboxEventId).toBeUndefined();
    });
  });
});
