import type { DashboardOverview } from '@tollbooth/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/format';

type Budget = NonNullable<DashboardOverview['budget']>;

const WARN_AT = 0.75;
const CRITICAL_AT = 0.9;

/** Spend against this month's budget. The fill colour repeats what the text says; it never carries it alone. */
export function BudgetCard({ budget }: { budget: Budget }) {
  const percent = Math.round(budget.utilization * 100);
  const tone =
    budget.utilization >= CRITICAL_AT
      ? 'critical'
      : budget.utilization >= WARN_AT
        ? 'warning'
        : 'ok';
  const status = { ok: 'On track', warning: 'Approaching the limit', critical: 'Nearly spent' }[
    tone
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly budget</CardTitle>
        <CardDescription>Month-to-date spend against your plan limit.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold tracking-tight">{formatCurrency(budget.spentUsd)}</p>
          <p className="text-sm text-muted-foreground">of {formatCurrency(budget.limitUsd)}</p>
        </div>
        <div
          role="progressbar"
          aria-label="Monthly budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(percent, 100)}
          aria-valuetext={`${percent}% of the monthly budget used`}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width]',
              tone === 'critical' && 'bg-destructive',
              tone === 'warning' && 'bg-warning',
              tone === 'ok' && 'bg-success',
            )}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {percent}% used · {status}
        </p>
      </CardContent>
    </Card>
  );
}
