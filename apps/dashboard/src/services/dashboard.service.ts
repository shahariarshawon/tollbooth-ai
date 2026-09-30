import type { DashboardOverview } from '@/types/api';
import { http } from './api-client';

// Planned REST contract. Returns sample data from the mock adapter until analytics exist.
export const dashboardService = {
  overview: async (): Promise<DashboardOverview> =>
    (await http.get<DashboardOverview>('/dashboard/overview')).data,
};
