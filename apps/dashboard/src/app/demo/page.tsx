import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Logo } from '@/components/ui/navbar';
import { StartDemoButton } from '@/features/auth/start-demo-button';
import { isDemoEnabled } from '@/lib/server/demo';

export const metadata: Metadata = { title: 'Demo workspace' };

// The switch is read on every request: the same build serves deployments with and without a demo.
export const dynamic = 'force-dynamic';

export default function DemoPage() {
  const enabled = isDemoEnabled();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo />
      <Card className="w-full max-w-md">
        <CardHeader className="gap-1 p-6 pb-4">
          <h1 className="text-xl font-semibold tracking-tight">Demo workspace</h1>
          <CardDescription>
            {enabled
              ? 'A read-only tour of the dashboard, with sample data.'
              : 'The demo is not enabled on this deployment.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-6 pt-0">
          {enabled ? (
            <>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>No sign-up and no password: a short session starts when you click.</li>
                <li>
                  Everything is read-only. Creating, editing and deleting are switched off, and the
                  server enforces that.
                </li>
                <li>
                  The usage, cost and requests shown are generated sample data in a workspace that
                  is separate from every real tenant.
                </li>
                <li>The session ends by itself after a short time.</li>
              </ul>
              <StartDemoButton />
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                The live interactive demo workspace requires a connected control-plane backend
                running with{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  DEMO_MODE=true
                </code>
                .
              </p>
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">To run the demo workspace locally:</p>
                <div className="space-y-1 font-mono">
                  <p>1. Seed reference catalogue and synthetic demo data:</p>
                  <pre className="overflow-x-auto rounded bg-background p-2 text-foreground">
                    pnpm db:seed:demo
                  </pre>
                  <p>2. Set environment variables in your deployment:</p>
                  <pre className="overflow-x-auto rounded bg-background p-2 text-foreground">
                    DEMO_MODE=true&#10;CONTROL_PLANE_URL=http://localhost:3001
                  </pre>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                You can also{' '}
                <Link
                  href="/login"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  sign in
                </Link>{' '}
                with an account, or read how the system works on the home page.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
        Back to the home page
      </Link>
    </main>
  );
}
