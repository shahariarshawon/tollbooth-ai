'use client';

import * as React from 'react';
import { Permission } from '@tollbooth/shared';
import { Radio, RefreshCw } from 'lucide-react';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { CardGridSkeleton, Skeleton } from '@/components/ui/states';
import { AccessDenied, Can } from '@/features/auth/can';
import { usePermission } from '@/hooks/use-permission';
import {
  CostTrendChart,
  ProviderUsageChart,
  RequestVolumeChart,
  TokenUsageChart,
} from '../dashboard/charts';
import { AnalyticsStats } from './analytics-stats';
import { TopApiKeysTable, TopModelsTable, TopProjectsTable } from './analytics-tables';
import {
  ANALYTICS_PERIOD_DAYS,
  useAnalyticsCost,
  useAnalyticsModels,
  useAnalyticsOverview,
  useAnalyticsUsage,
} from './hooks';

function ChartsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="Loading charts">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-64" />
      ))}
    </div>
  );
}

function TablesSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" role="status" aria-label="Loading tables">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-64" />
      ))}
    </div>
  );
}

function AnalyticsContent() {
  const canViewBilling = usePermission(Permission.VIEW_BILLING);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const pollInterval = autoRefresh ? 15_000 : undefined;

  // Run all queries concurrently from initial mount to avoid waterfall delays
  const overview = useAnalyticsOverview(ANALYTICS_PERIOD_DAYS, pollInterval);
  const usage = useAnalyticsUsage(ANALYTICS_PERIOD_DAYS, pollInterval);
  const models = useAnalyticsModels(ANALYTICS_PERIOD_DAYS, pollInterval);
  const cost = useAnalyticsCost(ANALYTICS_PERIOD_DAYS, pollInterval);

  const isRefreshing =
    overview.isFetching || usage.isFetching || models.isFetching || (canViewBilling && cost.isFetching);

  const handleRefresh = () => {
    void overview.refetch();
    void usage.refetch();
    void models.refetch();
    if (canViewBilling) {
      void cost.refetch();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                autoRefresh ? 'bg-emerald-400' : 'bg-muted-foreground'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                autoRefresh ? 'bg-emerald-500' : 'bg-muted-foreground'
              }`}
            />
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {autoRefresh ? 'Live Telemetry (15s polling)' : 'Telemetry paused'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className="h-8 text-xs gap-1.5"
          >
            <Radio className={`h-3.5 w-3.5 ${autoRefresh ? 'text-emerald-500' : 'text-muted-foreground'}`} />
            {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <QueryBoundary query={overview} loading={<CardGridSkeleton />}>
        {(data) => <AnalyticsStats overview={data} />}
      </QueryBoundary>

      <QueryBoundary query={usage} loading={<ChartsSkeleton />}>
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <RequestVolumeChart data={data.requestsOverTime} />
            <TokenUsageChart data={data.tokensOverTime} />
            {canViewBilling && (
              <QueryBoundary query={cost} loading={<Skeleton className="h-64" />}>
                {(costData) => <CostTrendChart data={costData.dailyCost} />}
              </QueryBoundary>
            )}
            <ProviderUsageChart data={data.providerUsage} />
          </div>
        )}
      </QueryBoundary>

      <QueryBoundary query={usage} loading={<TablesSkeleton />}>
        {(usageData) => (
          <QueryBoundary query={models} loading={<TablesSkeleton />}>
            {(modelsData) => (
              <div className="grid gap-4 lg:grid-cols-3">
                <TopApiKeysTable apiKeys={usageData.topApiKeys} />
                <TopProjectsTable projects={usageData.topProjects} />
                <TopModelsTable models={modelsData.models} />
              </div>
            )}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </div>
  );
}

export function AnalyticsPage() {
  return (
    <Can permission={Permission.VIEW_ANALYTICS} fallback={<AccessDenied />}>
      <PageHeader
        title="Usage Analytics"
        description="Requests, tokens and spend across your AI gateway, last 30 days."
      />
      <AnalyticsContent />
    </Can>
  );
}
