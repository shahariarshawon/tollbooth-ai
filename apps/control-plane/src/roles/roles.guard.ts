import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { roleHasPermission } from './permission';
import type { Permission } from './permission';
import { PERMISSIONS_KEY } from './permissions.decorator';

/**
 * Enforces @RequirePermission. Routes without it only need authentication, which the global JWT
 * guard already guarantees, so this guard must run after it.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !required.every((permission) => roleHasPermission(user.role, permission))) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
