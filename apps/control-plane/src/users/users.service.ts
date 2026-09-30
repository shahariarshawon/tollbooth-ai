import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@tollbooth/database';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import type { Page } from '../common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { USER_SELECT } from './user.select';
import type { UserResponse } from './user.select';

/**
 * Every query here is scoped by tenantId. A user id from another tenant behaves exactly like a
 * missing one (404), so ids cannot be used to probe other tenants.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, limit: number, offset: number): Promise<Page<UserResponse>> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { tenantId },
        select: USER_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count({ where: { tenantId } }),
    ]);
    return { data, total, limit, offset };
  }

  async get(tenantId: string, id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Creates an account in INVITED status. It becomes ACTIVE on the first successful login.
   * (A real invitation email with a one-time link is a later addition.)
   */
  async create(
    tenantId: string,
    actor: AuthenticatedUser,
    dto: CreateUserDto,
    ipAddress?: string,
  ): Promise<UserResponse> {
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId,
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: dto.role,
            status: 'INVITED',
          },
          select: USER_SELECT,
        });
        await this.audit.record(
          {
            action: AuditAction.USER_CREATED,
            resource: 'user',
            resourceId: user.id,
            tenantId,
            userId: actor.userId,
            ipAddress,
            metadata: { role: user.role },
          },
          tx,
        );
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateUserDto,
    ipAddress?: string,
  ): Promise<UserResponse> {
    const target = await this.get(tenantId, id);

    if (id === actor.userId && (dto.role !== undefined || dto.status !== undefined)) {
      throw new ForbiddenException('You cannot change your own role or status');
    }

    const changed = (Object.keys(dto) as (keyof UpdateUserDto)[]).filter(
      (field) => dto[field] !== undefined && dto[field] !== target[field],
    );
    if (changed.length === 0) return target;

    const losesAdmin =
      target.role === 'TENANT_ADMIN' &&
      ((dto.role !== undefined && dto.role !== 'TENANT_ADMIN') || dto.status === 'DISABLED');

    return this.prisma.$transaction(async (tx) => {
      if (losesAdmin) await this.assertAnotherActiveAdmin(tx, tenantId, id);

      const updated = await tx.user.update({
        where: { id, tenantId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          status: dto.status,
        },
        select: USER_SELECT,
      });

      const base = { resource: 'user', resourceId: id, tenantId, userId: actor.userId, ipAddress };
      await this.audit.record(
        { ...base, action: AuditAction.USER_UPDATED, metadata: { fields: changed } },
        tx,
      );
      if (dto.role !== undefined && dto.role !== target.role) {
        await this.audit.record(
          {
            ...base,
            action: AuditAction.ROLE_CHANGED,
            metadata: { from: target.role, to: dto.role },
          },
          tx,
        );
      }
      if (dto.status === 'DISABLED') await this.tokens.revokeAllForUser(id, tx);
      return updated;
    });
  }

  async remove(
    tenantId: string,
    actor: AuthenticatedUser,
    id: string,
    ipAddress?: string,
  ): Promise<void> {
    const target = await this.get(tenantId, id);
    if (id === actor.userId) throw new ForbiddenException('You cannot delete your own account');

    await this.prisma.$transaction(async (tx) => {
      if (target.role === 'TENANT_ADMIN') await this.assertAnotherActiveAdmin(tx, tenantId, id);
      await tx.user.delete({ where: { id, tenantId } });
      await this.audit.record(
        {
          action: AuditAction.USER_DELETED,
          resource: 'user',
          resourceId: id,
          tenantId,
          userId: actor.userId,
          ipAddress,
          metadata: { email: target.email, role: target.role },
        },
        tx,
      );
    });
  }

  /** A tenant must never be left without anyone able to administer it. */
  private async assertAnotherActiveAdmin(
    tx: Prisma.TransactionClient,
    tenantId: string,
    excludingUserId: string,
  ): Promise<void> {
    const others = await tx.user.count({
      where: {
        tenantId,
        role: 'TENANT_ADMIN',
        status: { not: 'DISABLED' },
        id: { not: excludingUserId },
      },
    });
    if (others === 0) {
      throw new ConflictException('A tenant must keep at least one active administrator');
    }
  }
}
