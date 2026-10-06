import type { RecentRequestRow } from '@tollbooth/shared';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/utils/format';

const timeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS = {
  SUCCESS: { label: 'Success', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  BLOCKED: { label: 'Blocked', variant: 'warning' },
} as const;

export function RecentRequests({ requests }: { requests: RecentRequestRow[] }) {
  const showCost = requests.some((request) => request.cost !== null);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Recent requests</CardTitle>
        <CardDescription>The latest calls through your gateway.</CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No requests yet"
            description="Requests appear here as soon as an API key calls the gateway."
            className="py-8"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Project / key</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                {showCost && <TableHead className="text-right">Cost</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {timeFormat.format(new Date(request.createdAt))}
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-40 truncate">{request.projectName}</span>
                    <span className="block max-w-40 truncate text-xs text-muted-foreground">
                      {request.apiKeyName}
                    </span>
                  </TableCell>
                  <TableCell>{request.model}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS[request.status].variant}>
                      {STATUS[request.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {request.latencyMs === null ? '-' : `${formatNumber(request.latencyMs)} ms`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(request.totalTokens)}
                  </TableCell>
                  {showCost && (
                    <TableCell className="text-right tabular-nums">
                      {request.cost === null ? '-' : formatCurrency(request.cost)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
