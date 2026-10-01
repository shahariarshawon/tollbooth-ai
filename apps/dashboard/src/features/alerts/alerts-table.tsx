import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Alert, AlertSeverity } from '@/types/api';
import { formatDate, humanize } from '@/utils/format';

const SEVERITY_VARIANT: Record<AlertSeverity, 'muted' | 'warning' | 'destructive'> = {
  INFO: 'muted',
  WARNING: 'warning',
  CRITICAL: 'destructive',
};

interface AlertsTableProps {
  alerts: Alert[];
  onMarkRead: (alert: Alert) => void;
  markingReadId?: string;
}

export function AlertsTable({ alerts, onMarkRead, markingReadId }: AlertsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Status</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Message</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((alert) => (
          <TableRow
            key={alert.id}
            className={alert.status === 'UNREAD' ? 'font-medium' : undefined}
          >
            <TableCell>
              <Badge variant={alert.status === 'UNREAD' ? 'default' : 'muted'}>
                {humanize(alert.status)}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={SEVERITY_VARIANT[alert.severity]}>{humanize(alert.severity)}</Badge>
            </TableCell>
            <TableCell className="max-w-md">
              <p>{alert.message}</p>
              <p className="text-xs font-normal text-muted-foreground">{humanize(alert.type)}</p>
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(alert.createdAt)}
            </TableCell>
            <TableCell>
              {alert.status === 'UNREAD' && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Mark as read"
                  disabled={markingReadId === alert.id}
                  onClick={() => onMarkRead(alert)}
                >
                  <Check className="size-4" aria-hidden />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
