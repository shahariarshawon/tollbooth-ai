/**
 * Roles and permissions, shared by the control plane (which enforces them) and the dashboard
 * (which uses them only to decide what to show). The backend is always the authority.
 */
export const USER_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'DEVELOPER', 'FINANCE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const Permission = {
  TENANT_MANAGE: 'TENANT_MANAGE',
  USER_READ: 'USER_READ',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  PROJECT_READ: 'PROJECT_READ',
  PROJECT_MANAGE: 'PROJECT_MANAGE',
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
    Permission.PROJECT_READ,
    Permission.PROJECT_MANAGE,
    Permission.API_KEY_CREATE,
    Permission.API_KEY_DELETE,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_BILLING,
    Permission.MANAGE_SETTINGS,
  ]),
  DEVELOPER: new Set<Permission>([
    Permission.PROJECT_READ,
    Permission.PROJECT_MANAGE,
    Permission.API_KEY_CREATE,
    Permission.API_KEY_DELETE,
    Permission.VIEW_ANALYTICS,
  ]),
  FINANCE: new Set<Permission>([
    Permission.PROJECT_READ,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_BILLING,
  ]),
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
