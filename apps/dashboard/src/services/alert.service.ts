import type { Alert, Page, PageParams } from '@/types/api';
import { http } from './api-client';

/** Real control-plane endpoints (apps/control-plane/src/alerts), not mocked. */
export const alertService = {
  list: async (params: PageParams = {}): Promise<Page<Alert>> =>
    (await http.get<Page<Alert>>('/alerts', { params })).data,

  unread: async (): Promise<Alert[]> => (await http.get<Alert[]>('/alerts/unread')).data,

  markRead: async (id: string): Promise<Alert> =>
    (await http.patch<Alert>(`/alerts/${id}/read`)).data,
};
