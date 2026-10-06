import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/** HTTP methods that cannot change anything. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Makes the public demo workspace read-only: any request that would change data in a demo tenant is
 * refused. It is a policy of the tenant, applied to whoever acts in it (the demo user, or a SUPER_ADMIN
 * who picked it with X-Tenant-Id), and it only ever narrows what the permission matrix already allows. It
 * never grants anything and never relaxes another guard; tenants that are not demo tenants are untouched.
 *
 * Runs after authentication, tenant resolution and the role check, so by the time it decides the
 * request is already authorised to the extent the caller's role allows.
 */
@Injectable()
export class DemoPolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.tenant?.isDemo || READ_METHODS.has(request.method)) return true;

    throw new ForbiddenException('This action is disabled in the demo workspace');
  }
}
