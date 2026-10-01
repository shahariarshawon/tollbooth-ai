import type { ApiKeyAuth } from '../common/types/gateway-request';
import type { RequestService } from '../requests/request.service';
import { UsageService } from './usage.service';
import type { UsageRepository } from './usage.repository';

const auth: ApiKeyAuth = {
  tenantId: 'tenant-1',
  projectId: 'project-1',
  apiKeyId: 'key-1',
  plan: 'STARTUP',
  permissions: [],
  rateLimit: null,
};

function build() {
  const requests = {
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  } as unknown as jest.Mocked<RequestService>;
  const ledger = {
    recordLedgerEntry: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<UsageRepository>;
  return { service: new UsageService(requests, ledger), requests, ledger };
}

describe('UsageService', () => {
  describe('recordSuccess', () => {
    it('records the request, then an AI_USAGE ledger entry charging the estimated cost', async () => {
      const { service, requests, ledger } = build();
      requests.recordSuccess.mockResolvedValue('req-1');

      await service.recordSuccess({
        auth,
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
        latencyMs: 120,
        usage: { requestTokens: 11, responseTokens: 7, totalTokens: 18 },
        estimatedCostUsd: '0.00000500',
      });

      expect(requests.recordSuccess).toHaveBeenCalledTimes(1);
      expect(ledger.recordLedgerEntry).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        requestId: 'req-1',
        transactionType: 'AI_USAGE',
        amountUsd: '-0.00000500',
        description: 'GOOGLE gemini-2.0-flash',
      });
    });

    it('records a free-tier (zero-cost) call as a 0 ledger entry, not skipped', async () => {
      const { service, requests, ledger } = build();
      requests.recordSuccess.mockResolvedValue('req-2');

      await service.recordSuccess({
        auth,
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
        latencyMs: 80,
        usage: { requestTokens: 11, responseTokens: 7, totalTokens: 18 },
        estimatedCostUsd: '0.00000000',
      });

      expect(ledger.recordLedgerEntry).toHaveBeenCalledWith(
        expect.objectContaining({ amountUsd: '0', transactionType: 'AI_USAGE' }),
      );
    });

    it('still writes the ledger entry, without a requestId, when the request record failed to save', async () => {
      const { service, requests, ledger } = build();
      requests.recordSuccess.mockResolvedValue(undefined);

      await service.recordSuccess({
        auth,
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
        latencyMs: 80,
        usage: { requestTokens: 11, responseTokens: 7, totalTokens: 18 },
        estimatedCostUsd: '0.00000500',
      });

      expect(ledger.recordLedgerEntry).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: undefined }),
      );
    });

    it('does not throw when the ledger write itself fails: the caller has already been served', async () => {
      const { service, requests, ledger } = build();
      requests.recordSuccess.mockResolvedValue('req-3');
      ledger.recordLedgerEntry.mockRejectedValue(new Error('db down'));

      await expect(
        service.recordSuccess({
          auth,
          provider: 'GOOGLE',
          model: 'gemini-2.0-flash',
          latencyMs: 80,
          usage: { requestTokens: 11, responseTokens: 7, totalTokens: 18 },
          estimatedCostUsd: '0.00000500',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('recordFailure', () => {
    it('records the request but writes no ledger entry: nothing was spent', async () => {
      const { service, requests, ledger } = build();

      await service.recordFailure({
        auth,
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
        latencyMs: 50,
        requestTokens: 11,
        errorMessage: 'timeout',
      });

      expect(requests.recordFailure).toHaveBeenCalledTimes(1);
      expect(ledger.recordLedgerEntry).not.toHaveBeenCalled();
    });
  });

  describe('recordAdjustment', () => {
    it('writes a manual ledger entry of the given type, with no requestId', async () => {
      const { service, ledger } = build();

      await service.recordAdjustment({
        tenantId: 'tenant-1',
        transactionType: 'CREDIT',
        amountUsd: '25.00000000',
        description: 'Support credit',
      });

      expect(ledger.recordLedgerEntry).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        transactionType: 'CREDIT',
        amountUsd: '25.00000000',
        description: 'Support credit',
      });
    });
  });
});
