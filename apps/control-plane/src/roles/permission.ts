import type { UserRole } from '@tollbooth/database';

export const Permission = {
  TENANT_MANAGE: 'TENANT_MANAGE',
  USER_READ: 'USER_READ',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  API_KEY_CREATE: 'API_KEY_CREATE',
  API_KEY_DELETE: 'API_KEY_DELETE',
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
  VIEW_BILLING: 'VIEW_BILLING',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS = Object.values(Permission);

/** Static role to permission matrix. Changing it is a code change, reviewed like any other. */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  SUPER_ADMIN: new Set(ALL_PERMISSIONS),
  TENANT_ADMIN: new Set<Permission>([
    Permission.USER_READ,
    Permission.USER_CREATE,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.API_KEY_CREATE,
    Permission.API_KEY_DELETE,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_BILLING,
    Permission.MANAGE_SETTINGS,
  ]),
  DEVELOPER: new Set<Permission>([
    Permission.API_KEY_CREATE,
    Permission.API_KEY_DELETE,
    Permission.VIEW_ANALYTICS,
  ]),
  FINANCE: new Set<Permission>([Permission.VIEW_ANALYTICS, Permission.VIEW_BILLING]),
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
