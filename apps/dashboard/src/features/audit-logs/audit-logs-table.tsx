'use client';

import * as React from 'react';
import { Eye, Shield, Laptop, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuditLog } from '@/types/api';

interface AuditLogsTableProps {
  logs: AuditLog[];
}

function getActionBadgeVariant(action: string) {
  if (action.includes('FAILED') || action.includes('REVOKE') || action.includes('DELETE')) {
    return 'destructive';
  }
  if (action.includes('CREATE') || action.includes('LOGIN')) {
    return 'default';
  }
  if (action.includes('UPDATE') || action.includes('CHANGE') || action.includes('ASSIGN')) {
    return 'muted';
  }
  return 'outline';
}

export function AuditLogsTable({ logs }: AuditLogsTableProps) {
  const [selectedLog, setSelectedLog] = React.useState<AuditLog | null>(null);

  return (
    <>
      <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold text-foreground py-3.5">Timestamp</TableHead>
              <TableHead className="font-semibold text-foreground">Actor</TableHead>
              <TableHead className="font-semibold text-foreground">Action</TableHead>
              <TableHead className="font-semibold text-foreground">Resource</TableHead>
              <TableHead className="font-semibold text-foreground">IP Address</TableHead>
              <TableHead className="text-right font-semibold text-foreground pr-6">Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => {
              const date = new Date(log.createdAt);
              const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const formattedTime = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                  {/* Timestamp */}
                  <TableCell className="py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    <span className="font-medium text-foreground">{formattedDate}</span>{' '}
                    <span className="text-muted-foreground/80">{formattedTime}</span>
                  </TableCell>

                  {/* Actor */}
                  <TableCell>
                    {log.actor ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">
                          {log.actor.name || log.actor.email}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {log.actor.email}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Terminal className="h-3 w-3" />
                        <span>System / API</span>
                      </div>
                    )}
                  </TableCell>

                  {/* Action Badge */}
                  <TableCell>
                    <Badge
                      variant={getActionBadgeVariant(log.action)}
                      className="text-[11px] font-mono tracking-tight font-medium"
                    >
                      {log.action}
                    </Badge>
                  </TableCell>

                  {/* Resource */}
                  <TableCell className="text-xs font-mono">
                    <span className="text-foreground font-semibold">{log.resource}</span>
                    {log.resourceId && (
                      <span className="text-muted-foreground ml-1.5 truncate max-w-[120px] inline-block align-bottom">
                        ({log.resourceId})
                      </span>
                    )}
                  </TableCell>

                  {/* IP Address */}
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {log.ipAddress ? (
                      <span className="flex items-center gap-1">
                        <Laptop className="h-3 w-3 text-muted-foreground/60" />
                        {log.ipAddress}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>

                  {/* Metadata Inspector */}
                  <TableCell className="text-right pr-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLog(log)}
                      className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Metadata Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Audit Event Details
            </DialogTitle>
            <DialogDescription>
              Action: <span className="font-mono font-medium text-foreground">{selectedLog?.action}</span>
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border border-border/60">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Actor</span>
                  <span className="font-medium text-foreground">
                    {selectedLog.actor?.name} ({selectedLog.actor?.email ?? 'System'})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Timestamp</span>
                  <span className="font-medium text-foreground">
                    {new Date(selectedLog.createdAt).toISOString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Resource</span>
                  <span className="font-mono text-foreground">
                    {selectedLog.resource} {selectedLog.resourceId && `• ${selectedLog.resourceId}`}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">IP Address</span>
                  <span className="font-mono text-foreground">{selectedLog.ipAddress || 'None'}</span>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px] mb-1 font-medium">
                  Event Metadata Payload
                </span>
                <pre className="p-3 bg-secondary/80 rounded-lg border border-border/80 font-mono text-[11px] text-secondary-foreground overflow-auto max-h-64 whitespace-pre-wrap">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
