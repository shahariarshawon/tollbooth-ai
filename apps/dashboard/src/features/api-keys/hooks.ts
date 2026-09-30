'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { apiKeyService } from '@/services/api-key.service';

export const KEY_PERMISSIONS = [
  { value: 'chat:completions', label: 'Chat completions' },
  { value: 'models:read', label: 'List models' },
] as const;

export function useApiKeys() {
  const scope = useTenantScope();
  return useQuery({ queryKey: ['api-keys', scope], queryFn: apiKeyService.list });
}

export function useApiKeyMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });

  return {
    create: useMutation({ mutationFn: apiKeyService.create, onSuccess: refresh }),
    rotate: useMutation({ mutationFn: apiKeyService.rotate, onSuccess: refresh }),
    revoke: useMutation({ mutationFn: apiKeyService.revoke, onSuccess: refresh }),
  };
}
