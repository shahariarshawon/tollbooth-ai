import type { PrismaService } from '@tollbooth/database';
import { AlertService } from './alert.service';
import type { NotificationService } from './notification.service';

function build() {
  const alertTable = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'alert-1', tenantId: 'tenant-1' }),
  };
  const prisma = { alert: alertTable } as unknown as PrismaService;
  const notifications = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationService>;
  return { service: new AlertService(prisma, notifications), alertTable, notifications };
}

describe('AlertService', () => {
  it('creates an alert and sends a notification for it', async () => {
    const { service, alertTable, notifications } = build();

    await service.create('tenant-1', 'BUDGET_LIMIT', 'Monthly budget reached', 'CRITICAL');

    expect(alertTable.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        type: 'BUDGET_LIMIT',
        message: 'Monthly budget reached',
        severity: 'CRITICAL',
      },
    });
    expect(notifications.sendNotification).toHaveBeenCalledWith({
      id: 'alert-1',
      tenantId: 'tenant-1',
    });
  });

  it('defaults to WARNING severity', async () => {
    const { service, alertTable } = build();

    await service.create('tenant-1', 'PROVIDER_ERROR', 'Gemini timed out');

    expect(alertTable.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: 'WARNING' }) }),
    );
  });

  it('does not create a second alert of the same type while an unread one is recent', async () => {
    const { service, alertTable } = build();
    alertTable.findFirst.mockResolvedValue({ id: 'existing' });

    await service.create('tenant-1', 'BUDGET_LIMIT', 'Monthly budget reached', 'CRITICAL');

    expect(alertTable.create).not.toHaveBeenCalled();
  });

  it('never throws, even when the database write fails', async () => {
    const { service, alertTable } = build();
    alertTable.create.mockRejectedValue(new Error('db down'));

    await expect(service.create('tenant-1', 'SECURITY_ALERT', 'Blocked')).resolves.toBeUndefined();
  });

  it('never throws when the notification itself fails', async () => {
    const { service, notifications } = build();
    notifications.sendNotification.mockRejectedValue(new Error('channel down'));

    await expect(
      service.create('tenant-1', 'HIGH_USAGE', 'Spike detected'),
    ).resolves.toBeUndefined();
  });
});
