import * as React from 'react';
import { AlertTriangle, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Card, CardContent, CardHeader } from './card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

/** Loading, empty and error states, shared by every page so they look and behave the same. */

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('size-4 animate-spin text-muted-foreground', className)}
      aria-label="Loading"
    />
  );
}

function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {Array.from({ length: columns }, (_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-3 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, row) => (
            <TableRow key={row} className="hover:bg-transparent">
              {Array.from({ length: columns }, (_, column) => (
                <TableCell key={column}>
                  <Skeleton className="h-4 w-full max-w-40" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export { Skeleton, Spinner, TableSkeleton, CardGridSkeleton, EmptyState, ErrorState };
