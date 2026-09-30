import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@tollbooth/database';
import { isUUID } from 'class-validator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

export const TENANT_HEADER = 'x-tenant-id';

/**
 * Establishes which tenant a request operates on and attaches it as `request.tenant`.
 *
 * - Tenant users always operate on the tenant in their own record. The JWT is never trusted for
 *   this, and a mismatching X-Tenant-Id header is rejected outright.
 * - SUPER_ADMIN has no tenant; it may select one with the X-Tenant-Id header to act inside it.
 *
 * Runs after the JWT guard, which has already verified the user and their tenant are active.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = request;
    const requested = request.headers[TENANT_HEADER];
    const requestedTenantId = typeof requested === 'string' ? requested : undefined;

    if (user.role !== 'SUPER_ADMIN') {
      if (requestedTenantId !== undefined && requestedTenantId !== user.tenantId) {
        throw new ForbiddenException('You cannot act on another tenant');
      }
      request.tenant = user.tenant;
      return true;
    }

    if (requestedTenantId === undefined) {
      request.tenant = null;
      return true;
    }
    if (!isUUID(requestedTenantId)) throw new NotFoundException('Tenant not found');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: requestedTenantId },
      select: { id: true, slug: true, status: true },
    });
    if (!tenant || tenant.status === 'DELETED') throw new NotFoundException('Tenant not found');
    request.tenant = tenant;
    return true;
  }
}
