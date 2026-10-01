'use client';

import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
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

function CostSection() {
  // The query itself is only enabled for a role with VIEW_BILLING (see hooks.ts); this check also
  // keeps a DEVELOPER from seeing a loading spinner for a chart that will never load for them.
  const canViewBilling = usePermission(Permission.VIEW_BILLING);
  const cost = useAnalyticsCost();
  if (!canViewBilling) return null;

  return (
    <QueryBoundary query={cost} loading={<Skeleton className="h-64" />}>
      {(data) => <CostTrendChart data={data.dailyCost} />}
    </QueryBoundary>
  );
}

function AnalyticsContent() {
  const overview = useAnalyticsOverview();
  const usage = useAnalyticsUsage();
  const models = useAnalyticsModels();

  return (
    <div className="flex flex-col gap-6">
      <QueryBoundary query={overview} loading={<CardGridSkeleton />}>
        {(data) => <AnalyticsStats overview={data} />}
      </QueryBoundary>

      <QueryBoundary query={usage} loading={<ChartsSkeleton />}>
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <RequestVolumeChart data={data.requestsOverTime} />
            <TokenUsageChart data={data.tokensOverTime} />
            <CostSection />
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
