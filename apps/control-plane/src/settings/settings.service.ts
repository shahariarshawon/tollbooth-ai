import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@tollbooth/database';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';

const DEFAULT_SETTINGS = {
  general: {
    orgName: 'My Organization',
    logoUrl: '',
    timezone: 'UTC',
    contactEmail: 'admin@organization.com',
  },
  security: {
    sessionTimeoutMinutes: 60,
    passwordMinLength: 8,
    requireSpecialChar: true,
    defaultKeyExpiryDays: 90,
  },
  ai: {
    defaultProvider: 'GOOGLE',
    allowedModels: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gpt-4o'],
    maxInputTokens: 4096,
    maxOutputTokens: 4096,
  },
  notifications: {
    emailAlerts: true,
    alertEmail: '',
    budgetThresholds: [75, 90, 100],
    notifyOnKeyRevoke: true,
  },
  system: {
    maintenanceMode: false,
    featureFlags: {
      streamingEnabled: false,
      piiMasking: true,
      promptGuard: true,
      teamLimits: true,
    },
  },
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getAllSettings(tenantId: string) {
    const [tenant, settingsRows] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.systemSetting.findMany({ where: { tenantId } }),
    ]);

    const settingsMap: Record<string, Record<string, unknown>> = {};
    for (const row of settingsRows) {
      settingsMap[row.category.toLowerCase()] = (row.value as Record<string, unknown>) ?? {};
    }

    return {
      general: {
        ...DEFAULT_SETTINGS.general,
        orgName: tenant?.companyName ?? DEFAULT_SETTINGS.general.orgName,
        ...(settingsMap['general'] ?? {}),
      },
      security: {
        ...DEFAULT_SETTINGS.security,
        ...(settingsMap['security'] ?? {}),
      },
      ai: {
        ...DEFAULT_SETTINGS.ai,
        ...(settingsMap['ai'] ?? {}),
      },
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...(settingsMap['notifications'] ?? {}),
      },
      system: {
        ...DEFAULT_SETTINGS.system,
        ...(settingsMap['system'] ?? {}),
      },
    };
  }

  async updateSection(
    tenantId: string,
    categoryName: string,
    value: Record<string, unknown>,
    actorUserId?: string,
  ) {
    const category = categoryName.toUpperCase();
    const validCategories = ['GENERAL', 'SECURITY', 'AI', 'NOTIFICATIONS', 'SYSTEM'];

    if (!validCategories.includes(category)) {
      throw new BadRequestException(`Invalid settings category: ${categoryName}`);
    }

    const key = `${category.toLowerCase()}_config`;

    // Fetch existing setting
    const existing = await this.prisma.systemSetting.findUnique({
      where: { tenantId_category_key: { tenantId, category, key } },
    });

    const mergedValue = {
      ...(existing?.value as Record<string, unknown> ?? {}),
      ...value,
    };

    const updated = await this.prisma.systemSetting.upsert({
      where: { tenantId_category_key: { tenantId, category, key } },
      update: { value: mergedValue as Prisma.InputJsonValue },
      create: {
        tenantId,
        category,
        key,
        value: mergedValue as Prisma.InputJsonValue,
      },
    });

    // If orgName is updated in general, keep tenant.companyName in sync
    if (category === 'GENERAL' && typeof value['orgName'] === 'string' && value['orgName'].trim()) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { companyName: value['orgName'].trim() },
      });
    }

    await this.audit.record({
      action: AuditAction.SETTINGS_CHANGED,
      resource: 'settings',
      resourceId: key,
      tenantId,
      userId: actorUserId,
      metadata: { category, updatedFields: Object.keys(value) },
    });

    return updated.value;
  }
}
