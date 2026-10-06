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
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-warning/15 px-4 py-2 text-sm"
    >
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span>
        <strong className="font-medium">Demo workspace.</strong> Read-only, with generated sample
        data. The session ends automatically.
      </span>
      <Button variant="outline" size="sm" onClick={() => void logout()}>
        Exit demo
      </Button>
    </div>
  );
}
