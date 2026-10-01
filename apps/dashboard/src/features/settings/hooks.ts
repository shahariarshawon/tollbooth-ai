'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { settingsService } from '@/services/settings.service';
import type { AllSettings } from '@/types/api';

export function useSettings() {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['settings', scope],
    queryFn: settingsService.getAll,
  });
}

export function useUpdateSettings<K extends keyof AllSettings>(category: K) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: Partial<AllSettings[K]>) =>
      settingsService.updateSection<AllSettings[K]>(category, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
