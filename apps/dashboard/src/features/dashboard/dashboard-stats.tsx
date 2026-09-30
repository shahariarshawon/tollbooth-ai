import { Coins, DollarSign, FolderKanban, Activity } from 'lucide-react';
import type { DashboardOverview } from '@/types/api';
import { formatCompactNumber, formatCurrency, formatNumber } from '@/utils/format';
import { StatCard } from './stat-card';

export function DashboardStats({ stats }: { stats: DashboardOverview['stats'] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Total AI Requests"
        value={formatNumber(stats.totalRequests)}
        icon={Activity}
        description="Last 30 days"
      />
      <StatCard
        title="Total Tokens"
        value={formatCompactNumber(stats.totalTokens)}
        icon={Coins}
        description="Input and output"
      />
      <StatCard
        title="Current Spending"
        value={formatCurrency(stats.currentSpend)}
        icon={DollarSign}
        description="Last 30 days"
      />
      <StatCard
        title="Active Projects"
        value={formatNumber(stats.activeProjects)}
        icon={FolderKanban}
        description="Sending traffic"
      />
    </div>
  );
}
