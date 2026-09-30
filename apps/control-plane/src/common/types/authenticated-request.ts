import type { Request } from 'express';
import type { TenantStatus, UserRole } from '@tollbooth/database';

export interface TenantSummary {
  id: string;
  slug: string;
  status: TenantStatus;
}

/** Identity resolved from the database on every request; the JWT only identifies the user. */
export interface AuthenticatedUser {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  tenant: TenantSummary | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  /** The tenant this request operates on. Null only for SUPER_ADMIN without X-Tenant-Id. */
  tenant: TenantSummary | null;
}
