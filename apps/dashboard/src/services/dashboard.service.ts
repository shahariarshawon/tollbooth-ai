import type { DashboardOverview } from '@tollbooth/shared';
import { http } from './api-client';

/** The landing page's data in one request: apps/control-plane/src/dashboard. */
export const dashboardService = {
  overview: async (days = 30): Promise<DashboardOverview> =>
    (await http.get<DashboardOverview>('/dashboard/overview', { params: { days } })).data,
};
