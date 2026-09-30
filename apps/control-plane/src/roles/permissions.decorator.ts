import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permission';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Requires the role of the caller to grant every listed permission. */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
