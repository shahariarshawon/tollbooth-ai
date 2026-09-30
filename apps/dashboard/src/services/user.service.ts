import type { AssignableRole, Page, PageParams, User } from '@/types/api';
import { http } from './api-client';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: AssignableRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  role?: AssignableRole;
  status?: 'ACTIVE' | 'DISABLED';
}

export const userService = {
  list: async (params: PageParams = {}): Promise<Page<User>> =>
    (await http.get<Page<User>>('/users', { params })).data,

  get: async (id: string): Promise<User> => (await http.get<User>(`/users/${id}`)).data,

  create: async (input: CreateUserInput): Promise<User> =>
    (await http.post<User>('/users', input)).data,

  update: async (id: string, input: UpdateUserInput): Promise<User> =>
    (await http.patch<User>(`/users/${id}`, input)).data,

  remove: async (id: string): Promise<void> => {
    await http.delete(`/users/${id}`);
  },
};
