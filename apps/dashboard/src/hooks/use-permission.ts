'use client';

import { roleHasPermission } from '@tollbooth/shared';
import type { Permission } from '@tollbooth/shared';
import { useAuth } from '@/features/auth/auth-provider';

/**
 * Whether the signed-in user holds a permission. This only decides what the UI shows; the control
 * plane enforces the same matrix on every request, so hiding a button is never the protection.
 */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  return user !== null && roleHasPermission(user.role, permission);
}

/** For components that check several permissions. */
export function usePermissions(): { can: (permission: Permission) => boolean } {
  const { user } = useAuth();
  return { can: (permission) => user !== null && roleHasPermission(user.role, permission) };
}
