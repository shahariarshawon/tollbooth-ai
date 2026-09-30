import { createParamDecorator, ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../types/authenticated-request';

const getRequest = (context: ExecutionContext) =>
  context.switchToHttp().getRequest<AuthenticatedRequest>();

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => getRequest(context).user,
);

/** The tenant the request operates on. Rejects requests with none (SUPER_ADMIN without X-Tenant-Id). */
export const CurrentTenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const tenant = getRequest(context).tenant;
    if (!tenant) {
      throw new ForbiddenException('Tenant context required. Super admins must send X-Tenant-Id.');
    }
    return tenant.id;
  },
);

export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => getRequest(context).ip,
);
