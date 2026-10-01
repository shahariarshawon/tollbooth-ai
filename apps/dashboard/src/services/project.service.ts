import type { Project, ProjectStatus } from '@/types/api';
import { http } from './api-client';

export interface CreateProjectInput {
  name: string;
  description?: string;
  teamId?: string;
  allowedModels?: string[];
  monthlyBudget?: number;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  teamId?: string | null;
  allowedModels?: string[];
  monthlyBudget?: number;
}

// Planned REST contract. Served by the mock adapter until the backend ships these routes.
export const projectService = {
  list: async (): Promise<Project[]> => (await http.get<Project[]>('/projects')).data,

  create: async (input: CreateProjectInput): Promise<Project> =>
    (await http.post<Project>('/projects', input)).data,

  update: async (id: string, input: UpdateProjectInput): Promise<Project> =>
    (await http.patch<Project>(`/projects/${id}`, input)).data,

  remove: async (id: string): Promise<void> => {
    await http.delete(`/projects/${id}`);
  },
};
