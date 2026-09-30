'use client';

import { useSyncExternalStore } from 'react';
import { getTenantScope, subscribeTenantScope } from '@/lib/tenant-scope';

/** The tenant a super admin selected, or null. Always null for tenant users. */
export function useTenantScope(): string | null {
  return useSyncExternalStore(subscribeTenantScope, getTenantScope, () => null);
}
