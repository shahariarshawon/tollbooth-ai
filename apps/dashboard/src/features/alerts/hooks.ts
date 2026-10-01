'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { alertService } from '@/services/alert.service';

export const ALERTS_PAGE_SIZE = 20;

export function useAlerts(offset: number) {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['alerts', scope, offset],
    queryFn: () => alertService.list({ limit: ALERTS_PAGE_SIZE, offset }),
  });
}

/** The navbar badge: a small, separate query so it refreshes on its own without the full list page. */
export function useUnreadAlerts() {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['alerts', 'unread', scope],
    queryFn: alertService.unread,
    refetchInterval: 60_000,
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertService.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
