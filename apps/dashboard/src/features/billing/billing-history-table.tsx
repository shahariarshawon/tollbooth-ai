'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BillingHistoryItem } from '@/types/api';

interface BillingHistoryTableProps {
  items: BillingHistoryItem[];
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function BillingHistoryTable({
  items,
  page,
  totalPages,
  onPageChange,
}: BillingHistoryTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">Usage & Ledger History</h3>
          <p className="text-xs text-muted-foreground">
            Financial ledger entries, charges, credits, and adjustments
          </p>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No billing history recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{formatDate(item.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={item.transactionType === 'AI_USAGE' ? 'outline' : 'default'}>
                      {item.transactionType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.description || 'AI Gateway traffic execution'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-xs">
                    ${item.amount.toFixed(4)} {item.currency}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
