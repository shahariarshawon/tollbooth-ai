import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FlaskConical, Shield, Sparkles } from 'lucide-react';
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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12 dark:bg-[#0B1220]">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex justify-center">
          <Logo href="/" />
        </div>

        <Card className="border border-border/80 bg-card shadow-xl">
          <CardHeader className="gap-1.5 p-6 pb-4">
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
              <FlaskConical className="size-3.5" />
              <span>Interactive Sandbox</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Demo workspace</h1>
            <CardDescription className="text-sm">
              {enabled
                ? 'A read-only tour of the dashboard, with sample data.'
                : 'The demo is not enabled on this deployment.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-6 p-6 pt-0">
            {enabled ? (
              <>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    What to expect in the demo:
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                      <span>
                        No sign-up and no password: a short session starts when you click.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                      <span>
                        Everything is read-only. Creating, editing and deleting are switched off,
                        and the server enforces that.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                      <span>
                        The usage, cost and requests shown are generated sample data in a workspace
                        that is separate from every real tenant.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                      <span>The session ends by itself after a short time.</span>
                    </li>
                  </ul>
                </div>

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
                  <p className="font-semibold text-foreground">
                    To run the demo workspace locally:
                  </p>
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

        <p className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to the home page
          </Link>
        </p>
      </div>
    </main>
  );
}
