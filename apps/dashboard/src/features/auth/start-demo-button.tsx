'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/services/api-error';
import { useAuth } from './auth-provider';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return 'Too many demo sessions right now. Please try again in a few minutes.';
    if (error.status === 404) return 'The demo is not enabled on this deployment.';
    if (error.status === 503)
      return 'The demo workspace is not set up in the database. Run "pnpm db:seed:demo" to initialize sample data.';
    if (error.status === 502)
      return 'The backend control plane is currently unreachable (502). Please verify the backend service is running.';
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
      <Button
        onClick={() => void onClick()}
        loading={starting}
        size="lg"
        className="w-full bg-blue-600 font-semibold text-white shadow-md shadow-blue-600/20 transition-all hover:bg-blue-500"
      >
        <Sparkles className="size-4 mr-1 text-white" aria-hidden />
        Explore Demo Workspace
      </Button>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
