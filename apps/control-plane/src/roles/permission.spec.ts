import { ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import {
  Permission,
  getRolePermissions,
  isModuleAllowed,
} from '@tollbooth/shared';
import { PermissionMiddleware } from './permission.middleware';
import type { RequestWithPermissions } from './permission.middleware';

describe('RBAC & Permission Checks', () => {
  describe('getRolePermissions', () => {
    it('grants all permissions to SUPER_ADMIN', () => {
      const perms = getRolePermissions('SUPER_ADMIN');
      expect(perms).toContain(Permission.TENANT_MANAGE);
      expect(perms).toContain(Permission.TEAM_MANAGE);
      expect(perms).toContain(Permission.MANAGE_BILLING);
      expect(perms).toContain(Permission.VIEW_AUDIT_LOGS);
    });

    it('grants team and billing management to TENANT_ADMIN', () => {
      const perms = getRolePermissions('TENANT_ADMIN');
      expect(perms).toContain(Permission.TEAM_READ);
      expect(perms).toContain(Permission.TEAM_MANAGE);
      expect(perms).toContain(Permission.MANAGE_BILLING);
      expect(perms).toContain(Permission.VIEW_AUDIT_LOGS);
      expect(perms).not.toContain(Permission.TENANT_MANAGE);
    });

    it('grants team management to TEAM_ADMIN', () => {
      const perms = getRolePermissions('TEAM_ADMIN');
      expect(perms).toContain(Permission.TEAM_READ);
      expect(perms).toContain(Permission.TEAM_MANAGE);
      expect(perms).toContain(Permission.API_KEY_CREATE);
      expect(perms).not.toContain(Permission.MANAGE_BILLING);
      expect(perms).not.toContain(Permission.MANAGE_SETTINGS);
    });

    it('grants read-only access to VIEWER', () => {
      const perms = getRolePermissions('VIEWER');
      expect(perms).toContain(Permission.TEAM_READ);
      expect(perms).toContain(Permission.PROJECT_READ);
      expect(perms).not.toContain(Permission.PROJECT_MANAGE);
      expect(perms).not.toContain(Permission.API_KEY_CREATE);
      expect(perms).not.toContain(Permission.MANAGE_BILLING);
    });

    it('grants billing and analytics to FINANCE', () => {
      const perms = getRolePermissions('FINANCE');
      expect(perms).toContain(Permission.MANAGE_BILLING);
      expect(perms).toContain(Permission.VIEW_ANALYTICS);
      expect(perms).not.toContain(Permission.API_KEY_CREATE);
      expect(perms).not.toContain(Permission.TEAM_MANAGE);
    });
  });

  describe('isModuleAllowed', () => {
    it('allows billing module to FINANCE and TENANT_ADMIN, denies DEVELOPER', () => {
      expect(isModuleAllowed('FINANCE', 'billing')).toBe(true);
      expect(isModuleAllowed('TENANT_ADMIN', 'billing')).toBe(true);
      expect(isModuleAllowed('DEVELOPER', 'billing')).toBe(false);
      expect(isModuleAllowed('VIEWER', 'billing')).toBe(false);
    });

    it('allows settings module to TENANT_ADMIN, denies VIEWER and DEVELOPER', () => {
      expect(isModuleAllowed('TENANT_ADMIN', 'settings')).toBe(true);
      expect(isModuleAllowed('DEVELOPER', 'settings')).toBe(false);
      expect(isModuleAllowed('VIEWER', 'settings')).toBe(false);
    });

    it('allows teams module to TENANT_ADMIN and TEAM_ADMIN, denies FINANCE', () => {
      expect(isModuleAllowed('TENANT_ADMIN', 'teams')).toBe(true);
      expect(isModuleAllowed('TEAM_ADMIN', 'teams')).toBe(true);
      expect(isModuleAllowed('FINANCE', 'teams')).toBe(false);
    });
  });

  describe('PermissionMiddleware', () => {
    let middleware: PermissionMiddleware;

    beforeEach(() => {
      middleware = new PermissionMiddleware();
    });

    it('attaches permissions to authenticated user and calls next()', () => {
      const req = {
        user: { id: 'usr-1', email: 'dev@test.com', tenantId: 'ten-1', role: 'DEVELOPER' },
        originalUrl: '/projects',
      } as unknown as RequestWithPermissions;
      const res = {} as Response;
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(req.permissions).toBeDefined();
      expect(req.permissions).toContain(Permission.PROJECT_READ);
      expect(next).toHaveBeenCalled();
    });

    it('blocks unauthorized module access with ForbiddenException', () => {
      const req = {
        user: { id: 'usr-dev', email: 'dev@test.com', tenantId: 'ten-1', role: 'DEVELOPER' },
        originalUrl: '/billing/summary',
      } as unknown as RequestWithPermissions;
      const res = {} as Response;
      const next = jest.fn();

      expect(() => middleware.use(req, res, next)).toThrow(ForbiddenException);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows authorized role access to module', () => {
      const req = {
        user: { id: 'usr-fin', email: 'fin@test.com', tenantId: 'ten-1', role: 'FINANCE' },
        originalUrl: '/billing/summary',
      } as unknown as RequestWithPermissions;
      const res = {} as Response;
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
