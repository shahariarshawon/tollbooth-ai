import type { AuditLogsResponse } from '@/types/api';
import { http } from './api-client';

export interface AuditQueryOptions {
  search?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const auditLogService = {
  list: async (options: AuditQueryOptions = {}): Promise<AuditLogsResponse> =>
    (await http.get<AuditLogsResponse>('/audit-logs', { params: options })).data,

  exportCsvUrl: (options: AuditQueryOptions = {}): string => {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.action) params.append('action', options.action);
    if (options.resource) params.append('resource', options.resource);
    if (options.from) params.append('from', options.from);
    if (options.to) params.append('to', options.to);
    return `/api/cp/audit-logs/export?${params.toString()}`;
  },
};
