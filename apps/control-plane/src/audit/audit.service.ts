import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@tollbooth/database';
import type { AuditAction } from './audit-actions';
import type { AuditQueryDto } from './dto/audit-query.dto';

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

export interface PaginatedAuditLogs {
  logs: Array<{
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    ipAddress: string | null;
    createdAt: Date;
    metadata: Record<string, unknown>;
    actor: {
      id: string;
      email: string;
      name: string;
    } | null;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

  async findMany(tenantId: string, query: AuditQueryDto): Promise<PaginatedAuditLogs> {
    const where: Prisma.AuditLogWhereInput = { tenantId };

    if (query.action) {
      where.action = query.action;
    }

    if (query.resource) {
      where.resource = query.resource;
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { resource: { contains: term, mode: 'insensitive' } },
        { resourceId: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [total, rawLogs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    const logs = rawLogs.map((log) => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      metadata: (log.metadata as Record<string, unknown>) ?? {},
      actor: log.user
        ? {
            id: log.user.id,
            email: log.user.email,
            name: `${log.user.firstName} ${log.user.lastName}`.trim(),
          }
        : null,
    }));

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async exportCsv(tenantId: string, query: AuditQueryDto): Promise<string> {
    // Fetch up to 5000 items for CSV export
    const where: Prisma.AuditLogWhereInput = { tenantId };

    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { resource: { contains: term, mode: 'insensitive' } },
        { resourceId: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    const headers = ['Timestamp', 'Action', 'Resource', 'Resource ID', 'Actor Email', 'Actor Name', 'IP Address', 'Metadata'];
    const rows = logs.map((log) => [
      log.createdAt.toISOString(),
      log.action,
      log.resource,
      log.resourceId ?? '',
      log.user?.email ?? '',
      log.user ? `${log.user.firstName} ${log.user.lastName}`.trim() : 'System',
      log.ipAddress ?? '',
      JSON.stringify(log.metadata ?? {}).replace(/"/g, '""'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}
