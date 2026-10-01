import type {
  AnalyticsCost,
  AnalyticsModels,
  AnalyticsOverview,
  AnalyticsUsage,
} from '@/types/api';
import { http } from './api-client';

/**
 * Real control-plane endpoints (apps/control-plane/src/analytics), not mocked: `/analytics/` is not in
 * mock-adapter.ts's MOCKED_PATHS, so these always go through `/api/cp` to the real backend. Cost fields
 * come back `null` for a signed-in DEVELOPER (no VIEW_BILLING); `/cost` itself answers 403 for them.
 */
export const analyticsService = {
  overview: async (days = 30): Promise<AnalyticsOverview> =>
    (await http.get<AnalyticsOverview>('/analytics/overview', { params: { days } })).data,

  usage: async (days = 30): Promise<AnalyticsUsage> =>
    (await http.get<AnalyticsUsage>('/analytics/usage', { params: { days } })).data,

  models: async (days = 30): Promise<AnalyticsModels> =>
    (await http.get<AnalyticsModels>('/analytics/models', { params: { days } })).data,

  cost: async (days = 30): Promise<AnalyticsCost> =>
    (await http.get<AnalyticsCost>('/analytics/cost', { params: { days } })).data,
};
