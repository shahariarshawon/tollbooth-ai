'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/services/api-error';
import { useAuth } from './auth-provider';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return 'Too many demo sessions right now. Please try again in a few minutes.';
    if (error.status === 404) return 'The demo is not enabled on this deployment.';
    if (error.status === 503) return 'The demo workspace is not available right now.';
  }
  return 'Could not start the demo. Please try again.';
}

export function StartDemoButton() {
  const { startDemo } = useAuth();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);

  async function onClick() {
    setError(null);
    setStarting(true);
    try {
      await startDemo();
      router.replace('/dashboard');
    } catch (cause) {
      setError(messageFor(cause));
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={() => void onClick()} loading={starting} size="lg">
        Explore Demo Workspace
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
