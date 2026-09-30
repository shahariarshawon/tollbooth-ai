import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@tollbooth/database';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { Page } from '../common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import type { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

const TENANT_SELECT = {
  id: true,
  companyName: true,
  slug: true,
  plan: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantSelect;

export type TenantResponse = Prisma.TenantGetPayload<{ select: typeof TENANT_SELECT }>;

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(limit: number, offset: number): Promise<Page<TenantResponse>> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        select: TENANT_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.tenant.count(),
    ]);
    return { data, total, limit, offset };
  }

  /** Tenant users can read only their own tenant; anything else looks like it does not exist. */
  async get(actor: AuthenticatedUser, id: string): Promise<TenantResponse> {
    if (!canAccess(actor, id)) throw new NotFoundException('Tenant not found');
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: TENANT_SELECT });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateTenantDto,
    ipAddress?: string,
  ): Promise<TenantResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { companyName: dto.companyName, slug: dto.slug, plan: dto.plan },
          select: TENANT_SELECT,
        });
        await this.audit.record(
          {
            action: AuditAction.TENANT_CREATED,
            resource: 'tenant',
            resourceId: tenant.id,
            tenantId: tenant.id,
            userId: actor.userId,
            ipAddress,
            metadata: { plan: tenant.plan },
          },
          tx,
        );
        return tenant;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tenant slug is already taken');
      }
      throw error;
    }
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateTenantDto,
    ipAddress?: string,
  ): Promise<TenantResponse> {
    if (!canAccess(actor, id)) throw new NotFoundException('Tenant not found');
    if (actor.role !== 'SUPER_ADMIN' && (dto.plan !== undefined || dto.status !== undefined)) {
      throw new ForbiddenException('Only a super admin can change a tenant plan or status');
    }

    const current = await this.get(actor, id);
    if (current.status === 'DELETED') throw new NotFoundException('Tenant not found');

    const changed = (Object.keys(dto) as (keyof UpdateTenantDto)[]).filter(
      (field) => dto[field] !== undefined && dto[field] !== current[field],
    );
    if (changed.length === 0) return current;

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id },
        data: { companyName: dto.companyName, plan: dto.plan, status: dto.status },
        select: TENANT_SELECT,
      });
      await this.audit.record(
        {
          action: AuditAction.TENANT_UPDATED,
          resource: 'tenant',
          resourceId: id,
          tenantId: id,
          userId: actor.userId,
          ipAddress,
          metadata: { fields: changed },
        },
        tx,
      );
      return tenant;
    });
  }

  /**
   * Soft delete: financial and audit records must outlive the tenant, so the row stays with
   * status DELETED. All sessions are revoked and every user is locked out immediately.
   */
  async remove(actor: AuthenticatedUser, id: string, ipAddress?: string): Promise<void> {
    const current = await this.get(actor, id);
    if (current.status === 'DELETED') throw new NotFoundException('Tenant not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id }, data: { status: 'DELETED' } });
      await tx.refreshToken.updateMany({
        where: { user: { tenantId: id }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: AuditAction.TENANT_DELETED,
          resource: 'tenant',
          resourceId: id,
          tenantId: id,
          userId: actor.userId,
          ipAddress,
        },
        tx,
      );
    });
  }
}

function canAccess(actor: AuthenticatedUser, tenantId: string): boolean {
  return actor.role === 'SUPER_ADMIN' || actor.tenantId === tenantId;
}
