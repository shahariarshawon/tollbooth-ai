'use client';

import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-provider';

/** Shown on every dashboard page of a demo session, so nobody mistakes sample data for a real account. */
export function DemoBanner() {
  const { user, logout } = useAuth();
  if (!user?.isDemo) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs sm:px-6 dark:bg-amber-950/30"
    >
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
        <FlaskConical className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span>
          <strong className="font-semibold">Demo workspace.</strong> Read-only, with generated sample
          data. The session ends automatically.
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void logout()}
        className="h-7 text-xs border-amber-600/30 bg-transparent hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        Exit demo
      </Button>
    </div>
  );
}
