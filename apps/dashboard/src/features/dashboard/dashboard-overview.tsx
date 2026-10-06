'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import Link from 'next/link';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { CardGridSkeleton, EmptyState, Skeleton } from '@/components/ui/states';
import { dashboardService } from '@/services/dashboard.service';
import { BudgetCard } from './budget-card';
import { DashboardStats } from './dashboard-stats';
import {
  CostTrendChart,
  ModelUsageChart,
  ProviderUsageChart,
  RequestVolumeChart,
} from './lazy-charts';
import { PolicyEvents } from './policy-events';
import { ProviderHealthCard } from './provider-health';
import { RecentRequests } from './recent-requests';

const PERIOD_DAYS = 30;
/** Refresh while the tab is visible. React Query pauses interval refetching in a hidden tab by default. */
const REFRESH_MS = 30_000;

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <CardGridSkeleton count={5} />
      <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="Loading overview">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-72" />
        ))}
      </div>
    </div>
  );
}

export function DashboardOverview() {
  const overview = useQuery({
    queryKey: ['dashboard', 'overview', PERIOD_DAYS],
    queryFn: () => dashboardService.overview(PERIOD_DAYS),
    refetchInterval: REFRESH_MS,
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Usage, spend and provider health across your AI gateway."
      />
      <QueryBoundary query={overview} loading={<OverviewSkeleton />}>
        {(data) => (
          <div className="flex flex-col gap-6">
            <DashboardStats stats={data.stats} periodDays={data.periodDays} />

            {data.stats.requests === 0 ? (
              <Card>
                <EmptyState
                  icon={Activity}
                  title={`No traffic in the last ${data.periodDays} days`}
                  description="Create an API key and send a request to the gateway. Usage, cost and latency appear here."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/api-keys">Go to API keys</Link>
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <RequestVolumeChart data={data.requestVolume} />
                {data.costTrend && <CostTrendChart data={data.costTrend} />}
                <ModelUsageChart data={data.modelUsage} />
                <ProviderUsageChart data={data.providerUsage} />
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <ProviderHealthCard providers={data.providers} />
              {data.budget ? (
                <BudgetCard budget={data.budget} />
              ) : (
                <PolicyEvents events={data.policyEvents} />
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <RecentRequests requests={data.recentRequests} />
              {data.budget && <PolicyEvents events={data.policyEvents} />}
            </div>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
