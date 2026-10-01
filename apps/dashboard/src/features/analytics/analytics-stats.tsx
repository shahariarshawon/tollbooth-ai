import { Activity, Coins, DollarSign, Users } from 'lucide-react';
import type { AnalyticsOverview } from '@/types/api';
import { formatCompactNumber, formatCurrency, formatNumber } from '@/utils/format';
import { StatCard } from '../dashboard/stat-card';

export function AnalyticsStats({ overview }: { overview: AnalyticsOverview }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Requests"
        value={formatNumber(overview.totalRequests)}
        icon={Activity}
        description={`Last ${overview.periodDays} days`}
      />
      <StatCard
        title="Tokens"
        value={formatCompactNumber(overview.totalTokens)}
        icon={Coins}
        description="Input and output"
      />
      <StatCard
        title="Cost"
        value={overview.totalCost === null ? '—' : formatCurrency(overview.totalCost)}
        icon={DollarSign}
        description={
          overview.totalCost === null
            ? 'Not visible to your role'
            : `Last ${overview.periodDays} days`
        }
      />
      <StatCard
        title="Active users"
        value={formatNumber(overview.activeUsers)}
        icon={Users}
        description="In this tenant"
      />
    </div>
  );
}
