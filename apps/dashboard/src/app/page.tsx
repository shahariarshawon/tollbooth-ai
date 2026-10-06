import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Logo } from '@/components/ui/navbar';
import { buttonVariants } from '@/components/ui/button';
import {
  CAPABILITIES,
  CURL_EXAMPLE,
  doc,
  HIGHLIGHTS,
  REPO_URL,
  REQUEST_FLOW,
} from '@/features/landing/landing-content';
import { cn } from '@/lib/utils';

// Fully static: this page never calls a backend, so it loads instantly even when the services behind
// the dashboard are asleep or down.
export const metadata: Metadata = {
  title: { absolute: 'Tollbooth AI: a multi-tenant LLM gateway with spend controls' },
  description:
    'One OpenAI-compatible API in front of several model providers, with per-tenant rate limits, budgets, audit logs and a dashboard.',
};

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {lead && <p className="text-muted-foreground">{lead}</p>}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo href="/" />
          <nav aria-label="Primary" className="ml-auto flex items-center gap-1 text-sm">
            <a
              href="#how-it-works"
              className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block"
            >
              How it works
            </a>
            <a
              href={doc('docs/architecture/system-design.md')}
              className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block"
            >
              Architecture
            </a>
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex max-w-3xl flex-col gap-5">
            <p className="text-sm font-medium text-muted-foreground">
              LLM gateway and AI governance
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              One API for every model. Limits, budgets and an audit trail for every tenant.
            </h1>
            <p className="text-lg text-muted-foreground">
              Tollbooth AI sits between your applications and your model providers. It exposes an
              OpenAI-compatible endpoint, and decides who may call what, how often, and how much it
              may cost, before a request reaches a provider.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/demo" className={cn(buttonVariants({ size: 'lg' }))}>
              Explore Live Demo <ArrowRight aria-hidden />
            </Link>
            <a href={REPO_URL} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              <BookOpen aria-hidden /> Read the code
            </a>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The demo is a read-only workspace with generated sample data. No sign-up or password.
          </p>
        </section>

        <section aria-labelledby="problem" className="border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
            <SectionHeading
              id="problem"
              title="The problem it solves"
              lead="Teams that call model APIs directly end up with provider keys in every service, no per-team limits, a bill nobody can attribute, and one provider outage taking features down."
            />
            <div className="grid gap-4 md:grid-cols-3">
              {[
                [
                  'Keys everywhere',
                  'Applications get a revocable Tollbooth key. Provider credentials stay in the gateway.',
                ],
                [
                  'Surprise bills',
                  'Budgets are reserved before a call and settled after it, per tenant, with alerts as they fill.',
                ],
                [
                  'No visibility',
                  'Every request is recorded with its model, tokens, latency and cost, and sensitive actions are audited.',
                ],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-border bg-background p-5">
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="how-it-works-heading"
          id="how-it-works"
          className="border-t border-border"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
            <SectionHeading
              id="how-it-works-heading"
              title="What happens to one request"
              lead="Each step runs only if the cheaper steps before it passed, so a rejected request costs as little as possible."
            />
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {REQUEST_FLOW.map((step, index) => (
                <li
                  key={step.title}
                  className="flex gap-4 rounded-xl border border-border bg-card p-5"
                >
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-medium">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <pre
              aria-label="Example request"
              className="overflow-x-auto rounded-xl border border-border bg-card p-5 text-sm leading-relaxed"
            >
              <code>{CURL_EXAMPLE}</code>
            </pre>
          </div>
        </section>

        <section aria-labelledby="capabilities" className="border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
            <SectionHeading id="capabilities" title="What it does" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((capability) => (
                <div
                  key={capability.title}
                  className="rounded-xl border border-border bg-background p-5"
                >
                  <h3 className="font-medium">{capability.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{capability.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="engineering" className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
            <SectionHeading
              id="engineering"
              title="Engineering details"
              lead="Decisions that matter when the system is under load or something fails. Each links to where it is written down."
            />
            <div className="grid gap-4 md:grid-cols-2">
              {HIGHLIGHTS.map((highlight) => (
                <div key={highlight.title} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-medium">{highlight.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{highlight.body}</p>
                  <a
                    href={doc(highlight.where)}
                    className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
                  >
                    {highlight.where}
                  </a>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              What is implemented, what is not, and the trade-offs are listed in the{' '}
              <a
                href={REPO_URL}
                className="font-medium text-foreground underline underline-offset-4"
              >
                README
              </a>
              .
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">See it with data in it</h2>
            <p className="max-w-xl text-muted-foreground">
              The demo workspace has a month of generated traffic, teams, projects and alerts. You
              can look at everything and change nothing.
            </p>
            <Link href="/demo" className={cn(buttonVariants({ size: 'lg' }))}>
              Explore Live Demo <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>Tollbooth AI, a portfolio project.</span>
          <a href={REPO_URL} className="underline underline-offset-4">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
