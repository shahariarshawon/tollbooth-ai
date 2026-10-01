'use client';

import * as React from 'react';
import { QueryBoundary } from '@/components/query-boundary';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import type { Alert } from '@/types/api';
import { AlertsTable } from './alerts-table';
import { ALERTS_PAGE_SIZE, useAlerts, useMarkAlertRead } from './hooks';

export function AlertsPage() {
  const [offset, setOffset] = React.useState(0);
  const alerts = useAlerts(offset);
  const markRead = useMarkAlertRead();

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Budget, provider and security notices for your tenant."
      />
      <Card>
        <QueryBoundary
          query={alerts}
          loading={<TableSkeleton columns={5} />}
          empty={<EmptyState title="No alerts" description="Nothing to report yet." />}
          isEmpty={(page) => page.data.length === 0}
        >
          {(page) => (
            <>
              <AlertsTable
                alerts={page.data}
                onMarkRead={(alert: Alert) => markRead.mutate(alert.id)}
                markingReadId={markRead.isPending ? markRead.variables : undefined}
              />
              <Pagination
                offset={offset}
                limit={ALERTS_PAGE_SIZE}
                total={page.total}
                onChange={setOffset}
              />
            </>
          )}
        </QueryBoundary>
      </Card>
    </>
  );
}
