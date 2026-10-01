import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type { AlertSeverity, AlertType } from '@tollbooth/database';
import { NotificationService } from './notification.service';

/** An identical, still-unread alert within this window is not repeated: one budget-exceeded tenant
 *  hammering the gateway should not produce one row per request. */
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Creates and stores alerts for the three events Phase 11 wires up (`budget.service.ts`,
 * `usage/usage.service.ts`, `security/security.guard.ts`). Reading, listing and marking them read is
 * the control plane's job (`apps/control-plane/src/alerts`) — the same split Phase 7/10 already use for
 * `ai_requests`/`ledger_entries`: the gateway writes what it observes directly to the shared database;
 * the control plane serves it to the dashboard.
 *
 * Never throws: creating an alert must not turn an otherwise-handled event (a budget rejection, a
 * provider failure, a blocked request) into a second, unrelated failure for the caller.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async create(
    tenantId: string,
    type: AlertType,
    message: string,
    severity: AlertSeverity = 'WARNING',
  ): Promise<void> {
    try {
      const recent = await this.prisma.alert.findFirst({
        where: {
          tenantId,
          type,
          status: 'UNREAD',
          createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
      });
      if (recent) return;

      const alert = await this.prisma.alert.create({ data: { tenantId, type, message, severity } });
      await this.notifications.sendNotification(alert);
    } catch (error) {
      this.logger.error(
        `Failed to create alert (tenantId=${tenantId}, type=${type})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
