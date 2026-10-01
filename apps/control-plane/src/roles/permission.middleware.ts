import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { isModuleAllowed, getRolePermissions } from './permission';
import type { UserRole, Permission } from './permission';

export interface RequestWithPermissions extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    tenantId: string | null;
  };
  permissions?: Permission[];
  allowedModules?: readonly string[];
}

@Injectable()
export class PermissionMiddleware implements NestMiddleware {
  use(req: RequestWithPermissions, res: Response, next: NextFunction): void {
    const user = req.user;
    if (user?.role) {
      req.permissions = getRolePermissions(user.role);

      // Extract top-level route prefix to determine module
      const rawPath = req.path ?? req.originalUrl ?? '';
      const pathSegments = rawPath.replace(/^\//, '').split('/');
      const moduleCandidate = pathSegments[0]?.toLowerCase();

      // System, health, and auth routes are universally reachable once authenticated
      const bypassModules = ['health', 'auth', '', 'favicon.ico'];

      if (moduleCandidate && !bypassModules.includes(moduleCandidate)) {
        if (!isModuleAllowed(user.role, moduleCandidate)) {
          throw new ForbiddenException(
            `Role ${user.role} is not authorized to access module: ${moduleCandidate}`,
          );
        }
      }
    }
    next();
  }
}
