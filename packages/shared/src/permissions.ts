/**
 * Roles and permissions, shared by the control plane (which enforces them) and the dashboard
 * (which uses them only to decide what to show). The backend is always the authority.
 */
export const USER_ROLES = [
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'TEAM_ADMIN',
  'DEVELOPER',
  'FINANCE',
  'VIEWER',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const Permission = {
  TENANT_MANAGE: 'TENANT_MANAGE',
  USER_READ: 'USER_READ',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  TEAM_READ: 'TEAM_READ',
  TEAM_MANAGE: 'TEAM_MANAGE',
  PROJECT_READ: 'PROJECT_READ',
  PROJECT_MANAGE: 'PROJECT_MANAGE',
  API_KEY_READ: 'API_KEY_READ',
  API_KEY_CREATE: 'API_KEY_CREATE',
  API_KEY_DELETE: 'API_KEY_DELETE',
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
  VIEW_BILLING: 'VIEW_BILLING',
  MANAGE_BILLING: 'MANAGE_BILLING',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
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
    Permission.TEAM_READ,
    Permission.TEAM_MANAGE,
    Permission.PROJECT_READ,
    Permission.PROJECT_MANAGE,
    Permission.API_KEY_READ,
    Permission.API_KEY_CREATE,
    Permission.API_KEY_DELETE,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_BILLING,
    Permission.MANAGE_BILLING,
    Permission.VIEW_AUDIT_LOGS,
    Permission.MANAGE_SETTINGS,
  ]),
  TEAM_ADMIN: new Set<Permission>([
    Permission.USER_READ,
    Permission.TEAM_READ,
    Permission.TEAM_MANAGE,
    Permission.PROJECT_READ,
    Permission.PROJECT_MANAGE,
    Permission.API_KEY_READ,
    Permission.API_KEY_CREATE,
    Permission.API_KEY_DELETE,
    Permission.VIEW_ANALYTICS,
  ]),
  DEVELOPER: new Set<Permission>([
    Permission.PROJECT_READ,
    Permission.PROJECT_MANAGE,
    Permission.API_KEY_READ,
    Permission.API_KEY_CREATE,
    Permission.API_KEY_DELETE,
    Permission.VIEW_ANALYTICS,
  ]),
  FINANCE: new Set<Permission>([
    Permission.PROJECT_READ,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_BILLING,
    Permission.MANAGE_BILLING,
  ]),
  VIEWER: new Set<Permission>([
    Permission.PROJECT_READ,
    Permission.VIEW_ANALYTICS,
    Permission.TEAM_READ,
  ]),
};

export const ROLE_MODULES: Readonly<Record<UserRole, readonly string[]>> = {
  SUPER_ADMIN: [
    'dashboard',
    'tenants',
    'users',
    'teams',
    'projects',
    'api-keys',
    'analytics',
    'billing',
    'alerts',
    'audit-logs',
    'settings',
  ],
  TENANT_ADMIN: [
    'dashboard',
    'users',
    'teams',
    'projects',
    'api-keys',
    'analytics',
    'billing',
    'alerts',
    'audit-logs',
    'settings',
  ],
  TEAM_ADMIN: ['dashboard', 'teams', 'projects', 'api-keys', 'analytics', 'alerts'],
  DEVELOPER: ['dashboard', 'projects', 'api-keys', 'analytics', 'alerts'],
  FINANCE: ['dashboard', 'analytics', 'billing', 'alerts'],
  VIEWER: ['dashboard', 'projects', 'teams', 'analytics', 'alerts'],
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isModuleAllowed(role: UserRole, module: string): boolean {
  return ROLE_MODULES[role]?.includes(module) ?? false;
}

export function getRolePermissions(role: UserRole): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
