'use client';

import { isReadOnlyPermission, roleHasPermission } from '@tollbooth/shared';
import type { Permission } from '@tollbooth/shared';
import type { SessionUser } from '@/types/api';
import { useAuth } from '@/features/auth/auth-provider';

/**
 * A role's permission, narrowed for the read-only demo workspace, where only looking is allowed. The
 * control plane refuses demo writes whatever the UI shows; this just stops the UI offering them.
 */
function allowed(user: SessionUser | null, permission: Permission): boolean {
  if (user === null || !roleHasPermission(user.role, permission)) return false;
  return !user.isDemo || isReadOnlyPermission(permission);
}

/**
 * Whether the signed-in user holds a permission. This only decides what the UI shows; the control
 * plane enforces the same matrix on every request, so hiding a button is never the protection.
 */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  return allowed(user, permission);
}

/** For components that check several permissions. */
export function usePermissions(): { can: (permission: Permission) => boolean } {
  const { user } = useAuth();
  return { can: (permission) => allowed(user, permission) };
}
