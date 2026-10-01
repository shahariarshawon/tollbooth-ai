import type { ApiKey, IssuedApiKey } from '@/types/api';
import { http } from './api-client';

export interface CreateApiKeyInput {
  name: string;
  projectId: string;
  teamId?: string;
  permissions?: string[];
  rateLimit?: number;
  expiresAt?: string;
}

// Planned REST contract. Served by the mock adapter until the backend ships these routes.
// Only create and rotate ever return a secret, and only once.
export const apiKeyService = {
  list: async (): Promise<ApiKey[]> => (await http.get<ApiKey[]>('/api-keys')).data,

  create: async (input: CreateApiKeyInput): Promise<IssuedApiKey> =>
    (await http.post<IssuedApiKey>('/api-keys', input)).data,

  rotate: async (id: string): Promise<IssuedApiKey> =>
    (await http.post<IssuedApiKey>(`/api-keys/${id}/rotate`)).data,

  revoke: async (id: string): Promise<ApiKey> =>
    (await http.post<ApiKey>(`/api-keys/${id}/revoke`)).data,

  delete: async (id: string): Promise<void> => {
    await http.delete(`/api-keys/${id}`);
  },
};
