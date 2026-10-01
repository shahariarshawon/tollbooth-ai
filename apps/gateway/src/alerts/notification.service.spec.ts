import type { Alert } from '@tollbooth/database';
import { NotificationService } from './notification.service';

const alert = {
  id: 'alert-1',
  tenantId: 'tenant-1',
  type: 'BUDGET_LIMIT',
  message: 'Monthly budget reached',
  severity: 'CRITICAL',
  status: 'UNREAD',
  createdAt: new Date(),
  readAt: null,
} as unknown as Alert;

describe('NotificationService', () => {
  it('sends the alert to every channel without throwing (placeholders only, Task 4)', async () => {
    const service = new NotificationService();
    await expect(service.sendNotification(alert)).resolves.toBeUndefined();
  });
});
