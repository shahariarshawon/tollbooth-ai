'use client';

import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { QueryBoundary } from '@/components/query-boundary';
import { PageHeader } from '@/components/ui/page-header';
import { CardGridSkeleton, Skeleton } from '@/components/ui/states';
import { dashboardService } from '@/services/dashboard.service';
import { CostTrendChart, ModelUsageChart, ProviderUsageChart, RequestVolumeChart } from './charts';
import { DashboardStats } from './dashboard-stats';
import { ProviderStatus } from './provider-status';

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <CardGridSkeleton />
      <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="Loading charts">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-80" />
        ))}
      </div>
    </div>
  );
}

export function DashboardOverview() {
  const overview = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: dashboardService.overview,
  });

  return (
    <>
      <PageHeader title="Dashboard" description="Usage and spend across your AI gateway." />
      <p className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        <Info className="size-4 shrink-0" aria-hidden />
        Live usage telemetry and active provider health across your AI gateway.
      </p>
      <QueryBoundary query={overview} loading={<OverviewSkeleton />}>
        {(data) => (
          <div className="flex flex-col gap-6">
            <DashboardStats stats={data.stats} />
            <ProviderStatus providers={data.providers} />
            <div className="grid gap-4 lg:grid-cols-2">
              <RequestVolumeChart data={data.requestVolume} />
              <CostTrendChart data={data.costTrend} />
              <ModelUsageChart data={data.modelUsage} />
              <ProviderUsageChart data={data.providerUsage} />
            </div>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
