import { renderHook } from '@testing-library/react';
import { Permission } from '@tollbooth/shared';
import type { UserRole } from '@tollbooth/shared';
import { usePermission, usePermissions } from './use-permission';

let user: { role: UserRole; isDemo: boolean } | null = null;
jest.mock('@/features/auth/auth-provider', () => ({ useAuth: () => ({ user }) }));

describe('usePermission', () => {
  it('follows the role for an ordinary session', () => {
    user = { role: 'TENANT_ADMIN', isDemo: false };
    expect(renderHook(() => usePermission(Permission.API_KEY_CREATE)).result.current).toBe(true);
    user = { role: 'VIEWER', isDemo: false };
    expect(renderHook(() => usePermission(Permission.API_KEY_CREATE)).result.current).toBe(false);
  });

  it('is false when signed out', () => {
    user = null;
    expect(renderHook(() => usePermission(Permission.PROJECT_READ)).result.current).toBe(false);
  });

  it('lets a demo session look but never write, even for an admin role', () => {
    user = { role: 'TENANT_ADMIN', isDemo: true };
    const { can } = renderHook(() => usePermissions()).result.current;
    expect(can(Permission.PROJECT_READ)).toBe(true);
    expect(can(Permission.VIEW_BILLING)).toBe(true);
    expect(can(Permission.VIEW_AUDIT_LOGS)).toBe(true);
    expect(can(Permission.PROJECT_MANAGE)).toBe(false);
    expect(can(Permission.API_KEY_CREATE)).toBe(false);
    expect(can(Permission.USER_DELETE)).toBe(false);
    expect(can(Permission.MANAGE_SETTINGS)).toBe(false);
    expect(can(Permission.MANAGE_BILLING)).toBe(false);
  });

  it('still respects the role inside a demo session', () => {
    user = { role: 'VIEWER', isDemo: true };
    expect(renderHook(() => usePermission(Permission.USER_READ)).result.current).toBe(false);
  });
});
