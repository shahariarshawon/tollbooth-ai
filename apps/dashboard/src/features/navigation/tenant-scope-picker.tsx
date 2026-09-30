'use client';

import { useQuery } from '@tanstack/react-query';
import { Select } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-provider';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { setTenantScope } from '@/lib/tenant-scope';
import { tenantService } from '@/services/tenant.service';

/**
 * Lets a super admin choose which tenant the tenant-scoped pages (users, and later projects and
 * keys) operate on. It renders nothing for everyone else.
 */
export function TenantScopePicker({ className }: { className?: string }) {
  const { user } = useAuth();
  const scope = useTenantScope();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const tenants = useQuery({
    queryKey: ['tenants', 'picker'],
    queryFn: () => tenantService.list({ limit: 100 }),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) return null;

  return (
    <Select
      aria-label="Working tenant"
      className={className ?? 'w-44'}
      value={scope ?? ''}
      onChange={(event) => setTenantScope(event.target.value || null)}
    >
      <option value="">Select tenant...</option>
      {tenants.data?.data
        .filter((tenant) => tenant.status !== 'DELETED')
        .map((tenant) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.companyName}
          </option>
        ))}
    </Select>
  );
}
