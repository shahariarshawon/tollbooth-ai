import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck, Terminal, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Logo } from '@/components/ui/navbar';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Sign in | Tollbooth AI' };

/** Only allow redirects back into the dashboard, so a crafted link cannot send users elsewhere. */
function safeRedirect(next: string | undefined): string {
  return next && next.startsWith('/dashboard') && !next.startsWith('//') ? next : '/dashboard';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = safeRedirect(next);

  return (
    <main className="min-h-dvh flex flex-col lg:grid lg:grid-cols-2 bg-slate-50 dark:bg-[#0B1220]">
      {/* Left Column: Enterprise Value & Gateway Visual (Desktop) */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#0B1220] p-12 text-white">
        {/* Background glow and subtle grid */}
        <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-30" />
        <div className="pointer-events-none absolute -top-24 left-1/4 -z-10 h-[400px] w-[500px] rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 right-10 -z-10 h-[300px] w-[400px] rounded-full bg-indigo-600/15 blur-3xl" />

        {/* Top: Brand Logo */}
        <div className="relative z-10">
          <Logo href="/" light />
        </div>

        {/* Center: Hero Copy & Feature Highlights */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
            <ShieldCheck className="size-3.5 text-blue-400" />
            <span>Enterprise AI Gateway & Governance</span>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Control AI Access & Costs in One Unified Layer.
          </h2>

          <p className="text-sm leading-relaxed text-slate-300">
            Manage provider routing, enforce atomic rate limits in Redis, reserve worst-case
            budgets in integer micro-dollars, and capture an immutable audit trail for every LLM call.
          </p>

          <div className="space-y-3 pt-2 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              <span>Multi-tenant data isolation enforced by PostgreSQL foreign keys</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              <span>Pre-flight budget reservations stop runaway spend before provider execution</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              <span>Distributed circuit breakers and automatic retries protect user uptime</span>
            </div>
          </div>

          {/* Sleek Mini Event Terminal Preview */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-[#111C30]/90 p-4 font-mono text-xs shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="size-3.5 text-blue-400" />
                <span>ingress.stream</span>
              </div>
              <span className="text-emerald-400">GATEWAY_ACTIVE</span>
            </div>
            <pre className="mt-2 text-[11px] text-slate-300">
              {JSON.stringify(
                {
                  event: 'gateway.request.authorized',
                  tenant: 'acme-corp',
                  model: 'gemini-2.0-flash',
                  budget_reserved_microdollars: 1800,
                  circuit_status: 'CLOSED',
                },
                null,
                2,
              )}
            </pre>
          </div>
        </div>

        {/* Bottom footer text */}
        <div className="relative z-10 text-xs text-slate-500">
          Open Source AI Infrastructure • MIT Licensed
        </div>
      </div>

      {/* Right Column: Authentication Card Form */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Logo */}
          <div className="flex justify-center lg:hidden">
            <Logo href="/" />
          </div>

          <Card className="border border-border/80 bg-card shadow-lg">
            <CardHeader className="gap-1 p-6 pb-4">
              <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
              <CardDescription>Use your Tollbooth AI account to continue.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <LoginForm redirectTo={redirectTo} />
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground underline underline-offset-4">
              ← Back to the home page
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
