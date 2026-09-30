import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@tollbooth/database';
import { Permission, ROLE_PERMISSIONS, roleHasPermission } from './permission';
import { RequirePermission } from './permissions.decorator';
import { RolesGuard } from './roles.guard';

class ProtectedController {
  @RequirePermission(Permission.USER_CREATE)
  create(): void {}

  @RequirePermission(Permission.VIEW_BILLING, Permission.VIEW_ANALYTICS)
  both(): void {}

  openToAnyAuthenticatedUser(): void {}
}

function contextFor(handler: () => void, role: UserRole | undefined): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ProtectedController,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { userId: 'u1', role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('role permission matrix', () => {
  it('gives SUPER_ADMIN every permission', () => {
    for (const permission of Object.values(Permission)) {
      expect(roleHasPermission('SUPER_ADMIN', permission)).toBe(true);
    }
  });

  it('keeps tenant management exclusive to SUPER_ADMIN', () => {
    const roles = Object.keys(ROLE_PERMISSIONS) as UserRole[];
    const holders = roles.filter((role) => roleHasPermission(role, Permission.TENANT_MANAGE));
    expect(holders).toEqual(['SUPER_ADMIN']);
  });

  it.each([
    ['TENANT_ADMIN', Permission.USER_CREATE, true],
    ['DEVELOPER', Permission.USER_CREATE, false],
    ['FINANCE', Permission.USER_CREATE, false],
    ['DEVELOPER', Permission.API_KEY_CREATE, true],
    ['FINANCE', Permission.API_KEY_CREATE, false],
    ['FINANCE', Permission.VIEW_BILLING, true],
    ['DEVELOPER', Permission.VIEW_BILLING, false],
  ] as const)('%s / %s -> %s', (role, permission, expected) => {
    expect(roleHasPermission(role, permission)).toBe(expected);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const controller = new ProtectedController();

  it('allows a role that holds the permission', () => {
    expect(guard.canActivate(contextFor(controller.create, 'TENANT_ADMIN'))).toBe(true);
  });

  it('forbids a role that lacks the permission', () => {
    expect(() => guard.canActivate(contextFor(controller.create, 'DEVELOPER'))).toThrow(
      ForbiddenException,
    );
  });

  it('requires every listed permission, not just one', () => {
    expect(guard.canActivate(contextFor(controller.both, 'TENANT_ADMIN'))).toBe(true);
    expect(() => guard.canActivate(contextFor(controller.both, 'DEVELOPER'))).toThrow(
      ForbiddenException,
    );
  });

  it('lets any authenticated user through when no permission is declared', () => {
    expect(guard.canActivate(contextFor(controller.openToAnyAuthenticatedUser, 'FINANCE'))).toBe(
      true,
    );
  });

  it('forbids a protected route when there is no user on the request', () => {
    expect(() => guard.canActivate(contextFor(controller.create, undefined))).toThrow(
      ForbiddenException,
    );
  });
});
