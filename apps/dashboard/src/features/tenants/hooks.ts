'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantService } from '@/services/tenant.service';
import type { UpdateTenantInput } from '@/services/tenant.service';

export const TENANTS_PAGE_SIZE = 20;

export function useTenants(offset: number) {
  return useQuery({
    queryKey: ['tenants', 'list', offset],
    queryFn: () => tenantService.list({ limit: TENANTS_PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });
}

export function useTenantMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tenants'] });

  return {
    create: useMutation({ mutationFn: tenantService.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateTenantInput }) =>
        tenantService.update(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: tenantService.remove, onSuccess: refresh }),
  };
}
