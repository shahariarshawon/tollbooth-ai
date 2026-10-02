import { useQuery } from '@tanstack/react-query';
import { Permission } from '@tollbooth/shared';
import { usePermission } from '@/hooks/use-permission';
import { analyticsService } from '@/services/analytics.service';

/** Same window for every chart and table on the page, so they describe the same period. */
export const ANALYTICS_PERIOD_DAYS = 30;

export function useAnalyticsOverview(days = ANALYTICS_PERIOD_DAYS, refetchInterval?: number) {
  return useQuery({
    queryKey: ['analytics', 'overview', days],
    queryFn: () => analyticsService.overview(days),
    refetchInterval,
  });
}

export function useAnalyticsUsage(days = ANALYTICS_PERIOD_DAYS, refetchInterval?: number) {
  return useQuery({
    queryKey: ['analytics', 'usage', days],
    queryFn: () => analyticsService.usage(days),
    refetchInterval,
  });
}

export function useAnalyticsModels(days = ANALYTICS_PERIOD_DAYS, refetchInterval?: number) {
  return useQuery({
    queryKey: ['analytics', 'models', days],
    queryFn: () => analyticsService.models(days),
    refetchInterval,
  });
}

/** Only fetched for a role that can see it: calling /analytics/cost without VIEW_BILLING is a 403. */
export function useAnalyticsCost(days = ANALYTICS_PERIOD_DAYS, refetchInterval?: number) {
  const canViewBilling = usePermission(Permission.VIEW_BILLING);
  return useQuery({
    queryKey: ['analytics', 'cost', days],
    queryFn: () => analyticsService.cost(days),
    enabled: canViewBilling,
    refetchInterval,
  });
}
