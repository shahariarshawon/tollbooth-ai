'use client';

import * as React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/states';

interface QueryBoundaryProps<T> {
  query: Pick<UseQueryResult<T>, 'data' | 'isPending' | 'isError' | 'error' | 'refetch'>;
  /** Skeleton shown while the first load is in flight. */
  loading: React.ReactNode;
  /** Shown instead of children when `isEmpty` says there is nothing to list. */
  empty?: React.ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}

/**
 * The one place that turns a query into loading, error (with retry), empty or content, so every
 * page handles all four states the same way.
 */
export function QueryBoundary<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
}: QueryBoundaryProps<T>) {
  if (query.isPending) return <>{loading}</>;
  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Unable to load data.'}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const data = query.data as T;
  if (empty && isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
