'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { projectService } from '@/services/project.service';
import type { UpdateProjectInput } from '@/services/project.service';

export function useProjects() {
  const scope = useTenantScope();
  return useQuery({ queryKey: ['projects', scope], queryFn: projectService.list });
}

export function useProjectMutations() {
  const queryClient = useQueryClient();
  // Keys and the dashboard summary show project names and counts, so refresh them too.
  const refresh = () =>
    Promise.all(
      ['projects', 'api-keys', 'dashboard'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );

  return {
    create: useMutation({ mutationFn: projectService.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateProjectInput }) =>
        projectService.update(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: projectService.remove, onSuccess: refresh }),
  };
}
