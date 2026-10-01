'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { teamService } from '@/services/team.service';
import type { AddMemberInput, CreateTeamInput, UpdateTeamInput } from '@/services/team.service';
import { userService } from '@/services/user.service';

export function useTeams() {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['teams', scope],
    queryFn: teamService.list,
  });
}

export function useTeam(id: string | null) {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['team', scope, id],
    queryFn: () => (id ? teamService.get(id) : null),
    enabled: !!id,
  });
}

export function useTenantUsers() {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['users', scope],
    queryFn: () => userService.list({ limit: 100 }),
  });
}

export function useTeamMutations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teams'] }),
      queryClient.invalidateQueries({ queryKey: ['team'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);

  return {
    create: useMutation({
      mutationFn: (input: CreateTeamInput) => teamService.create(input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateTeamInput }) =>
        teamService.update(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => teamService.remove(id),
      onSuccess: refresh,
    }),
    addMember: useMutation({
      mutationFn: ({ teamId, input }: { teamId: string; input: AddMemberInput }) =>
        teamService.addMember(teamId, input),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
        teamService.removeMember(teamId, userId),
      onSuccess: refresh,
    }),
  };
}
