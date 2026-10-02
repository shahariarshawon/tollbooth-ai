'use client';

import * as React from 'react';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/states';
import { AccessDenied, Can } from '@/features/auth/can';
import { usePermission } from '@/hooks/use-permission';
import { AdjustLimitsDialog, ChangePlanDialog } from './billing-dialogs';
import { BillingHistoryTable } from './billing-history-table';
import { BillingOverviewCards } from './billing-overview-cards';
import { CurrentPlanCard } from './current-plan-card';
import { useBillingHistory, useBillingSummary } from './hooks';
import { ProviderBreakdownCard } from './provider-breakdown-card';

type DialogState = 'change-plan' | 'adjust-limits' | null;

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function BillingContent() {
  const canManage = usePermission(Permission.MANAGE_BILLING);
  const summaryQuery = useBillingSummary();
  const [historyPage, setHistoryPage] = React.useState(1);
  const historyQuery = useBillingHistory(historyPage, 10);
  const [dialog, setDialog] = React.useState<DialogState>(null);

  return (
    <>
      <PageHeader
        title="Billing & Cost Control"
        description="Monitor tenant LLM usage spend, configure billing plans, and set proactive budget caps."
      />

      <QueryBoundary query={summaryQuery} loading={<BillingSkeleton />}>
        {(summary) => (
          <div className="space-y-6">
            <BillingOverviewCards summary={summary} />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <CurrentPlanCard
                summary={summary}
                canManage={canManage}
                onChangePlan={() => setDialog('change-plan')}
                onAdjustLimits={() => setDialog('adjust-limits')}
              />
              <ProviderBreakdownCard
                breakdown={summary.providerBreakdown}
                totalUsage={summary.currentUsage}
              />
            </div>

            <QueryBoundary
              query={historyQuery}
              loading={<Skeleton className="h-64 w-full" />}
            >
              {(history) => (
                <BillingHistoryTable
                  items={history.items}
                  page={history.page}
                  totalPages={history.totalPages}
                  onPageChange={setHistoryPage}
                />
              )}
            </QueryBoundary>

            {dialog === 'change-plan' && (
              <ChangePlanDialog
                currentPlanCode={summary.currentPlan.code}
                onClose={() => setDialog(null)}
              />
            )}

            {dialog === 'adjust-limits' && (
              <AdjustLimitsDialog
                currentMonthlyLimit={summary.monthlyLimit}
                onClose={() => setDialog(null)}
              />
            )}
          </div>
        )}
      </QueryBoundary>
    </>
  );
}

export function BillingPage() {
  return (
    <Can permission={Permission.VIEW_BILLING} fallback={<AccessDenied />}>
      <BillingContent />
    </Can>
  );
}
