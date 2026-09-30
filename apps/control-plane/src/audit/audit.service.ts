import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@tollbooth/database';
import type { AuditAction } from './audit-actions';

export interface AuditEntry {
  action: AuditAction;
  resource: string;
  resourceId?: string;
  /** Null for platform-level events (unknown-email login failure, super admin without tenant). */
  tenantId?: string | null;
  /** The actor. Null for system events or unauthenticated attempts. */
  userId?: string | null;
  ipAddress?: string;
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass a transaction client so the audit row commits or rolls back with the change it describes. */
  async record(
    entry: AuditEntry,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        tenantId: entry.tenantId ?? null,
        userId: entry.userId ?? null,
        ipAddress: entry.ipAddress ?? null,
        metadata: entry.metadata ?? {},
      },
    });
  }
}
