import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@tollbooth/database';
import { SettingsService } from './settings.service';
import { AuditService } from '../audit/audit.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: {
    tenant: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    systemSetting: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let audit: {
    record: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', companyName: 'Acme Corp' }),
        update: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      systemSetting: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('settings updates', () => {
    it('updates a settings section and records audit log', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        tenantId: 'tenant-1',
        category: 'GENERAL',
        key: 'general_config',
        value: { orgName: 'Initial Org', timezone: 'UTC' },
      });

      prisma.systemSetting.upsert.mockResolvedValue({
        tenantId: 'tenant-1',
        category: 'GENERAL',
        key: 'general_config',
        value: { orgName: 'Updated Org Corp', timezone: 'America/New_York' },
      });

      const updated = (await service.updateSection(
        'tenant-1',
        'general',
        { orgName: 'Updated Org Corp', timezone: 'America/New_York' },
        'usr-admin',
      )) as Record<string, unknown>;

      expect(updated.orgName).toBe('Updated Org Corp');
      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_category_key: {
              tenantId: 'tenant-1',
              category: 'GENERAL',
              key: 'general_config',
            },
          },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'usr-admin',
          action: 'SETTINGS_CHANGED',
          resource: 'settings',
        }),
      );
    });
  });

  describe('dynamic settings and category fallback defaults', () => {
    it('returns default settings when database has no saved rows', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);

      const all = await service.getAllSettings('tenant-1');

      expect(all.general.orgName).toBe('Acme Corp');
      expect(all.security.sessionTimeoutMinutes).toBe(60);
      expect(all.security.passwordMinLength).toBe(8);
      expect(all.ai.defaultProvider).toBe('GOOGLE');
      expect(all.system.maintenanceMode).toBe(false);
      expect(all.system.featureFlags.teamLimits).toBe(true);
    });

    it('merges stored database settings on top of defaults', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([
        {
          category: 'SECURITY',
          value: { sessionTimeoutMinutes: 120, passwordMinLength: 16 },
        },
        {
          category: 'SYSTEM',
          value: { maintenanceMode: true },
        },
      ]);

      const all = await service.getAllSettings('tenant-1');

      expect(all.security.sessionTimeoutMinutes).toBe(120);
      expect(all.security.passwordMinLength).toBe(16);
      expect(all.security.requireSpecialChar).toBe(true); // default preserved
      expect(all.system.maintenanceMode).toBe(true);
    });
  });
});
