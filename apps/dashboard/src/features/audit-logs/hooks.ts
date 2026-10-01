'use client';

import { useQuery } from '@tanstack/react-query';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { auditLogService, type AuditQueryOptions } from '@/services/audit-log.service';

export function useAuditLogs(options: AuditQueryOptions) {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['audit-logs', scope, options],
    queryFn: () => auditLogService.list(options),
  });
}
