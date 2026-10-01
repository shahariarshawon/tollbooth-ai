import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@tollbooth/database';
import { AuditService } from './audit.service';
import { AuditAction } from './audit-actions';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('events recording', () => {
    it('records an audit event with actor, action, resource, and metadata', async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.record({
        tenantId: 'tenant-123',
        userId: 'usr-1',
        action: AuditAction.API_KEY_CREATED,
        resource: 'ApiKey',
        resourceId: 'key-abc',
        ipAddress: '192.168.1.1',
        metadata: { name: 'Production Key', permissions: ['chat:completions'] },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-123',
          userId: 'usr-1',
          action: 'API_KEY_CREATED',
          resource: 'ApiKey',
          resourceId: 'key-abc',
          ipAddress: '192.168.1.1',
          metadata: { name: 'Production Key', permissions: ['chat:completions'] },
        }),
      });
    });

    it('records system events when userId is null', async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 'log-2' });

      await service.record({
        tenantId: 'tenant-123',
        action: AuditAction.BUDGET_CHANGED,
        resource: 'Billing',
        metadata: { limit: 1000 },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
          action: 'BUDGET_CHANGED',
        }),
      });
    });
  });

  describe('audit queries and CSV export', () => {
    it('filters logs by action, resource, and date range', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          action: 'USER_CREATED',
          resource: 'User',
          resourceId: 'usr-2',
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-10-01T12:00:00Z'),
          metadata: { email: 'dev@test.com' },
          actor: { id: 'usr-1', email: 'admin@test.com', name: 'Admin' },
        },
      ]);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.findMany('tenant-123', {
        action: AuditAction.USER_CREATED,
        resource: 'User',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-02T00:00:00Z',
        page: 1,
        limit: 10,
      });

      expect(result.total).toBe(1);
      expect(result.logs[0]?.action).toBe('USER_CREATED');
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-123',
            action: 'USER_CREATED',
            resource: 'User',
          }),
        }),
      );
    });

    it('exports audit logs as formatted CSV', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          action: 'LOGIN',
          resource: 'Auth',
          resourceId: null,
          ipAddress: '10.0.0.1',
          createdAt: new Date('2026-10-01T10:00:00Z'),
          metadata: { method: 'password' },
          actor: { id: 'usr-1', email: 'user@test.com', name: 'User One' },
        },
      ]);

      const csv = await service.exportCsv('tenant-123', { page: 1, limit: 1000 });
      expect(csv).toContain('Timestamp,Action,Resource,Resource ID,Actor Email,Actor Name,IP Address,Metadata');
      expect(csv).toContain('LOGIN');
      expect(csv).toContain('10.0.0.1');
    });
  });
});
