'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { userService } from '@/services/user.service';
import type { UpdateUserInput } from '@/services/user.service';

export const USERS_PAGE_SIZE = 20;

/** Whether this user must pick a tenant before tenant-scoped data can load (super admins only). */
export function useNeedsTenantScope(): boolean {
  const { user } = useAuth();
  const scope = useTenantScope();
  return user?.role === 'SUPER_ADMIN' && scope === null;
}

export function useUsers(offset: number) {
  const scope = useTenantScope();
  const needsScope = useNeedsTenantScope();
  return useQuery({
    // The scope is part of the key so switching tenant never shows another tenant's cached users.
    queryKey: ['users', scope, offset],
    queryFn: () => userService.list({ limit: USERS_PAGE_SIZE, offset }),
    enabled: !needsScope,
    placeholderData: keepPreviousData,
  });
}

export function useUserMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  return {
    create: useMutation({ mutationFn: userService.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
        userService.update(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: userService.remove, onSuccess: refresh }),
  };
}
