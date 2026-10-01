// The matrix lives in @tollbooth/shared so the dashboard shows exactly what this service enforces.
export {
  Permission,
  ROLE_PERMISSIONS,
  roleHasPermission,
  ROLE_MODULES,
  isModuleAllowed,
  getRolePermissions,
  USER_ROLES,
} from '@tollbooth/shared';
export type { UserRole } from '@tollbooth/shared';

