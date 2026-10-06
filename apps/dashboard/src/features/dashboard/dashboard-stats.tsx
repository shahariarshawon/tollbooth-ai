import { Activity, Coins, DollarSign, FolderKanban, Gauge, TriangleAlert } from 'lucide-react';
import type { DashboardOverview } from '@tollbooth/shared';
import { formatCompactNumber, formatCurrency, formatNumber } from '@/utils/format';
import { StatCard } from './stat-card';

const formatPercent = (ratio: number): string =>
  `${(ratio * 100).toLocaleString('en-US', { maximumFractionDigits: ratio < 0.1 ? 1 : 0 })}%`;

/** The headline numbers. The cost card is simply absent for roles without VIEW_BILLING. */
export function DashboardStats({
  stats,
  periodDays,
}: {
  stats: DashboardOverview['stats'];
  periodDays: number;
}) {
  const period = `Last ${periodDays} days`;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <StatCard
        title="Requests"
        value={formatNumber(stats.requests)}
        icon={Activity}
        description={period}
      />
      <StatCard
        title="Tokens"
        value={formatCompactNumber(stats.tokens)}
        icon={Coins}
        description="Input and output"
      />
      {stats.cost !== null && (
        <StatCard
          title="Spend"
          value={formatCurrency(stats.cost)}
          icon={DollarSign}
          description={period}
        />
      )}
      <StatCard
        title="Error rate"
        value={formatPercent(stats.errorRate)}
        icon={TriangleAlert}
        description="Failed requests"
      />
      <StatCard
        title="p95 latency"
        value={stats.p95LatencyMs === null ? 'No data' : `${formatNumber(stats.p95LatencyMs)} ms`}
        icon={Gauge}
        description="95% of requests are faster"
      />
      <StatCard
        title="Active projects"
        value={formatNumber(stats.activeProjects)}
        icon={FolderKanban}
        description={`${formatNumber(stats.activeApiKeys)} active API ${stats.activeApiKeys === 1 ? 'key' : 'keys'}`}
      />
    </div>
  );
}
