import type { Team, TeamMemberRole } from '@/types/api';
import { http } from './api-client';

export interface CreateTeamInput {
  name: string;
  description?: string;
  rateLimitRpm?: number;
  rateLimitRpd?: number;
  tokenLimitTpm?: number;
  tokenLimitTpd?: number;
  dailyBudget?: number;
  monthlyBudget?: number;
  allowedModels?: string[];
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
  rateLimitRpm?: number;
  rateLimitRpd?: number;
  tokenLimitTpm?: number;
  tokenLimitTpd?: number;
  dailyBudget?: number;
  monthlyBudget?: number;
  allowedModels?: string[];
}

export interface AddMemberInput {
  userId: string;
  role?: TeamMemberRole;
}

export const teamService = {
  list: async (): Promise<Team[]> => (await http.get<Team[]>('/teams')).data,

  get: async (id: string): Promise<Team> => (await http.get<Team>(`/teams/${id}`)).data,

  create: async (input: CreateTeamInput): Promise<Team> =>
    (await http.post<Team>('/teams', input)).data,

  update: async (id: string, input: UpdateTeamInput): Promise<Team> =>
    (await http.patch<Team>(`/teams/${id}`, input)).data,

  remove: async (id: string): Promise<void> => {
    await http.delete(`/teams/${id}`);
  },

  addMember: async (teamId: string, input: AddMemberInput) =>
    (await http.post(`/teams/${teamId}/members`, input)).data,

  removeMember: async (teamId: string, userId: string) => {
    await http.delete(`/teams/${teamId}/members/${userId}`);
  },
};
