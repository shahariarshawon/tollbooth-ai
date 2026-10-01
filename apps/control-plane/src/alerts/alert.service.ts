import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import type { Alert, AlertSeverity, AlertType } from '@tollbooth/database';
import type { Page } from '../common/dto/pagination-query.dto';

/**
 * Reads and updates what the gateway writes (`apps/gateway/src/alerts`) — the same split Phase 7/10 use
 * for `ai_requests`/`ledger_entries`: the gateway observes the event and writes the row directly; the
 * control plane serves it to the dashboard. Every method here is scoped by `tenantId`, like every other
 * service in this app.
 */
@Injectable()
export class AlertService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, limit: number, offset: number): Promise<Page<Alert>> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.alert.count({ where: { tenantId } }),
    ]);
    return { data, total, limit, offset };
  }

  unread(tenantId: string): Promise<Alert[]> {
    return this.prisma.alert.findMany({
      where: { tenantId, status: 'UNREAD' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** A tenant id from another tenant behaves exactly like a missing one (404), the same as everywhere
   *  else in this app: ids never let a caller probe another tenant's data. */
  async markRead(tenantId: string, id: string): Promise<Alert> {
    const alert = await this.prisma.alert.findFirst({ where: { id, tenantId } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.status === 'READ') return alert;
    return this.prisma.alert.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  /**
   * "Create alerts" (Task 1) for parity with the gateway's own `AlertService`, and so the ledger's
   * `CREDIT`/`ADJUSTMENT` style of future manual action has an equivalent here. Not reachable from any
   * endpoint yet: every alert today comes from the gateway observing a real event directly.
   */
  create(
    tenantId: string,
    type: AlertType,
    message: string,
    severity: AlertSeverity = 'WARNING',
  ): Promise<Alert> {
    return this.prisma.alert.create({ data: { tenantId, type, message, severity } });
  }
}
