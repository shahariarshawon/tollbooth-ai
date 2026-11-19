import { BudgetService } from './budget.service';
import type { AlertService } from '../alerts/alert.service';
import { BudgetExceededException } from '../common/errors/traffic.exceptions';
import type { AppConfig } from '../config/config.module';
import { RedisFailurePolicy } from '../redis/redis-failure.policy';
import type { RedisService } from '../redis/redis.service';

describe('BudgetService (Unit & Concurrency Resilience)', () => {
  let redis: {
    run: jest.Mock;
    client: { hgetall: jest.Mock };
  };
  let policy: RedisFailurePolicy;
  let alerts: { create: jest.Mock };
  let service: BudgetService;

  beforeEach(() => {
    redis = {
      run: jest.fn(),
      client: { hgetall: jest.fn().mockResolvedValue({}) },
    };
    // Fail closed policy (GATEWAY_FAIL_OPEN: false)
    policy = new RedisFailurePolicy({ GATEWAY_FAIL_OPEN: false } as unknown as AppConfig);
    alerts = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    service = new BudgetService(
      redis as unknown as RedisService,
      policy,
      alerts as unknown as AlertService,
    );
  });

  describe('reserveBudget', () => {
    it('successfully reserves when budget fits and returns reservation details', async () => {
      // Mock Lua script reply: [allowed, monthlyLimit, currentUsage, reserved, remaining]
      redis.run.mockResolvedValue([1, 1000000, 200000, 300000, 500000]);

      const reservation = await service.reserveBudget('tenant-1', 1000000, 100000);

      expect(reservation).toEqual({
        tenantId: 'tenant-1',
        month: expect.any(String),
        amountMicroUsd: 100000,
        period: 'month',
      });
      expect(alerts.create).not.toHaveBeenCalled();
    });

    it('rejects with BudgetExceededException and creates BUDGET_LIMIT alert when exceeded', async () => {
      // Mock Lua script reply indicating limit reached: allowed = 0
      redis.run.mockResolvedValue([0, 1000000, 800000, 150000, 50000]);

      await expect(service.reserveBudget('tenant-1', 1000000, 100000)).rejects.toThrow(
        BudgetExceededException,
      );

      expect(alerts.create).toHaveBeenCalledWith(
        'tenant-1',
        'BUDGET_LIMIT',
        expect.stringContaining('budget has been reached'),
        'CRITICAL',
      );
    });

    it('prevents joint overspending during racing concurrent reservations', async () => {
      // Simulated atomic Redis Lua state
      let remaining = 300000;
      let reserved = 0;
      const limit = 500000;

      redis.run.mockImplementation(async (_script, _keys, args) => {
        const amount = Number(args[1]);
        if (amount <= remaining) {
          remaining -= amount;
          reserved += amount;
          return [1, limit, 0, reserved, remaining];
        }
        return [0, limit, 0, reserved, remaining];
      });

      // 4 concurrent requests racing, each asking for 100,000 (total 400,000 > 300,000 remaining)
      const attempts = await Promise.allSettled(
        Array.from({ length: 4 }, () => service.reserveBudget('tenant-1', limit, 100000)),
      );

      const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
      const rejected = attempts.filter((a) => a.status === 'rejected');

      // Exactly 3 can succeed (3 * 100,000 = 300,000); the 4th is rejected
      expect(fulfilled).toHaveLength(3);
      expect(rejected).toHaveLength(1);
      expect(remaining).toBe(0);
    });
  });

  describe('releaseBudget and updateUsage', () => {
    it('releases held reservation back to redis', async () => {
      redis.run.mockResolvedValue([1, 1000000, 0, 0, 1000000]);

      await service.releaseBudget({
        tenantId: 'tenant-1',
        month: '202610',
        amountMicroUsd: 150000,
        period: 'month',
      });

      expect(redis.run).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tollboothBudgetRelease' }),
        ['tenant:{tenant-1}:budget:202610'],
        [150000],
      );
    });

    it('settles actual usage and updates counters in redis', async () => {
      redis.run.mockResolvedValue([1, 1000000, 80000, 0, 920000]);

      await service.updateUsage(
        {
          tenantId: 'tenant-1',
          month: '202610',
          amountMicroUsd: 150000,
          period: 'month',
        },
        80000,
      );

      expect(redis.run).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tollboothBudgetSettle' }),
        ['tenant:{tenant-1}:budget:202610'],
        [150000, expect.any(Number), 80000],
      );
    });
  });

  describe('failure resilience when Redis is down', () => {
    it('fails closed (503) when GATEWAY_FAIL_OPEN is false', async () => {
      redis.run.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.reserveBudget('tenant-1', 1000000, 100000)).rejects.toMatchObject({
        status: 503,
      });
    });

    it('bypasses checks safely and returns null when GATEWAY_FAIL_OPEN is true', async () => {
      const openPolicy = new RedisFailurePolicy({
        GATEWAY_FAIL_OPEN: true,
      } as unknown as AppConfig);
      const openService = new BudgetService(
        redis as unknown as RedisService,
        openPolicy,
        alerts as unknown as AlertService,
      );
      redis.run.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await openService.reserveBudget('tenant-1', 1000000, 100000);
      expect(result).toBeNull();
    });
  });
});
