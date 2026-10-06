import type { PolicyEventRow } from '@tollbooth/shared';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { humanize } from '@/utils/format';

const SEVERITY: Record<PolicyEventRow['severity'], BadgeProps['variant']> = {
  INFO: 'muted',
  WARNING: 'warning',
  CRITICAL: 'destructive',
};

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** Security findings and budget thresholds the gateway has raised for this tenant. */
export function PolicyEvents({ events }: { events: PolicyEventRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security and budget events</CardTitle>
        <CardDescription>Raised by the gateway checks.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing to report"
            description="No security findings or budget thresholds so far."
            className="py-6"
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={SEVERITY[event.severity]}>{humanize(event.severity)}</Badge>
                  <time dateTime={event.createdAt} className="text-xs text-muted-foreground">
                    {dateFormat.format(new Date(event.createdAt))}
                  </time>
                </div>
                <p className="text-sm">{event.message}</p>
                <p className="text-xs text-muted-foreground">{humanize(event.type)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
