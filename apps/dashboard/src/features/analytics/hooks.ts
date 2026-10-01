import { useQuery } from '@tanstack/react-query';
import { Permission } from '@tollbooth/shared';
import { usePermission } from '@/hooks/use-permission';
import { analyticsService } from '@/services/analytics.service';

/** Same window for every chart and table on the page, so they describe the same period. */
export const ANALYTICS_PERIOD_DAYS = 30;

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ['analytics', 'overview', ANALYTICS_PERIOD_DAYS],
    queryFn: () => analyticsService.overview(ANALYTICS_PERIOD_DAYS),
  });
}

export function useAnalyticsUsage() {
  return useQuery({
    queryKey: ['analytics', 'usage', ANALYTICS_PERIOD_DAYS],
    queryFn: () => analyticsService.usage(ANALYTICS_PERIOD_DAYS),
  });
}

export function useAnalyticsModels() {
  return useQuery({
    queryKey: ['analytics', 'models', ANALYTICS_PERIOD_DAYS],
    queryFn: () => analyticsService.models(ANALYTICS_PERIOD_DAYS),
  });
}

/** Only fetched for a role that can see it: calling /analytics/cost without VIEW_BILLING is a 403. */
export function useAnalyticsCost() {
  const canViewBilling = usePermission(Permission.VIEW_BILLING);
  return useQuery({
    queryKey: ['analytics', 'cost', ANALYTICS_PERIOD_DAYS],
    queryFn: () => analyticsService.cost(ANALYTICS_PERIOD_DAYS),
    enabled: canViewBilling,
  });
}
