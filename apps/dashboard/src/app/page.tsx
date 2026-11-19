import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Gauge,
  KeyRound,
  Layers,
  Lock,
  Network,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Logo } from '@/components/ui/navbar';
import {
  CAPABILITIES,
  doc,
  HIGHLIGHTS,
  PROBLEMS_SOLUTIONS,
  REPO_URL,
  REQUEST_FLOW,
  TECH_STACK,
  USE_CASES,
} from '@/features/landing/landing-content';
import { CodePreviewTabs } from '@/features/landing/code-preview-tabs';
import { HeroMockup } from '@/features/landing/hero-mockup';
import { LandingNavbar } from '@/features/landing/landing-navbar';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Tollbooth AI | Distributed Multi-Tenant AI Gateway & Governance',
  description:
    'One unified OpenAI-compatible API for Gemini, OpenAI, and Anthropic. Pre-flight budget enforcement in exact micro-dollars, atomic Redis quotas, and Kafka audit streams.',
};

const STEP_ICONS: Record<string, React.ElementType> = {
  KeyRound,
  Gauge,
  Wallet,
  ShieldAlert,
  Cpu,
  Database,
};

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 antialiased selection:bg-blue-600 selection:text-white">
      {/* 1. Sticky Navigation */}
      <LandingNavbar />

      <main>
        {/* 2. Hero Section (Premium Dark Navy) */}
        <section className="relative overflow-hidden bg-[#0B1220] px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
          {/* Subtle Background Glow & Grid */}
          <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
          <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
          <div className="pointer-events-none absolute top-1/3 left-1/4 -z-10 h-[350px] w-[500px] rounded-full bg-indigo-600/10 blur-3xl" />

          <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 text-center">
            {/* Top Product Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-medium text-blue-300 backdrop-blur-md">
              <Sparkles className="size-3.5 text-blue-400" />
              <span>v2.0 Distributed AI Gateway — Production Ready</span>
            </div>

            {/* Headline */}
            <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              One Gateway. Complete Control Over{' '}
              <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-teal-300 bg-clip-text text-transparent">
                Enterprise AI.
              </span>
            </h1>

            {/* Supporting Copy */}
            <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
              Manage AI access, monitor token usage, enforce hard budgets in exact micro-dollars, and
              eliminate provider lock-in—all through a single OpenAI-compatible endpoint.
            </p>

            {/* Dual CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/demo"
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'h-11 bg-blue-600 px-6 font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 hover:shadow-blue-500/35',
                )}
              >
                Explore Live Demo <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'h-11 border-slate-700 bg-slate-900/80 px-6 font-medium text-slate-200 transition-all hover:border-slate-600 hover:bg-slate-800 hover:text-white',
                )}
              >
                <BookOpen className="size-4" aria-hidden /> View on GitHub
              </a>
            </div>

            <p className="text-xs text-slate-400">
              No account or credit card required • Includes 30 days of realistic sample traffic
            </p>

            {/* Realistic Product Mockup Console */}
            <div className="mt-8 w-full">
              <HeroMockup />
            </div>
          </div>
        </section>

        {/* 3. Problem and Solution Section */}
        <section id="problem-solution" className="border-t border-slate-200 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                The Enterprise Dilemma
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Why Model APIs Need a Dedicated Gateway
              </p>
              <p className="mt-4 text-base text-slate-600">
                Calling LLM providers directly causes unmonitored bills, leaking keys across services,
                and outages when an upstream provider degrades. Tollbooth AI fixes each root cause.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2">
              {PROBLEMS_SOLUTIONS.map((item) => (
                <div
                  key={item.problem}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                        <Flame className="size-4" />
                      </span>
                      <h3 className="font-semibold text-slate-900">{item.problem}</h3>
                    </div>
                    <p className="text-sm text-slate-600">{item.problemDetail}</p>
                  </div>

                  <div className="mt-6 rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      <h4 className="text-sm font-semibold text-emerald-950">{item.solution}</h4>
                    </div>
                    <p className="mt-1 text-xs text-emerald-800">{item.solutionDetail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Core Features Grid */}
        <section id="features" className="border-t border-slate-200 bg-slate-50/80 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Core Capabilities
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Engineered for Reliability & Scale
              </p>
              <p className="mt-4 text-base text-slate-600">
                Every feature is verified and implemented in the repository. No simulated metrics or
                unbacked claims.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((cap) => (
                <div
                  key={cap.title}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div>
                    {cap.badge && (
                      <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {cap.badge}
                      </span>
                    )}
                    <h3 className="mt-3 text-base font-semibold text-slate-900">{cap.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{cap.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. How It Works: Request Lifecycle & Code Preview */}
        <section
          id="how-it-works"
          className="border-t border-slate-800 bg-[#0B1220] py-20 text-white sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-teal-400">
                Request Architecture
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                What Happens to One AI Request
              </p>
              <p className="mt-4 text-base text-slate-300">
                Requests execute sequentially through inexpensive checks before touching any upstream
                provider. A rejected request costs minimal compute and zero provider dollars.
              </p>
            </div>

            {/* Visual Step Workflow */}
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {REQUEST_FLOW.map((step) => {
                const IconComponent = STEP_ICONS[step.iconName] ?? Zap;
                return (
                  <div
                    key={step.step}
                    className="relative rounded-xl border border-slate-800 bg-[#111C30] p-5 shadow-lg transition-all hover:border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-xs font-bold text-blue-400">
                        0{step.step}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                        <p className="text-[11px] font-medium text-slate-400">{step.subtitle}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-300">{step.detail}</p>
                  </div>
                );
              })}
            </div>

            {/* 1-Line Drop-In Code Tabs */}
            <div className="mt-16">
              <div className="mx-auto max-w-2xl text-center">
                <h3 className="text-xl font-bold text-white">100% Drop-In OpenAI Compatibility</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Switch existing services by simply changing your client’s base URL.
                </p>
              </div>
              <div className="mt-6 mx-auto max-w-3xl">
                <CodePreviewTabs />
              </div>
            </div>
          </div>
        </section>

        {/* 6. Product Showcase */}
        <section id="architecture" className="border-t border-slate-200 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Product Experience
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Purpose-Built SaaS Console
              </p>
              <p className="mt-4 text-base text-slate-600">
                Explore real-time usage graphs, tenant quotas, team allocations, and provider health
                monitors inside the unified control plane.
              </p>
            </div>

            <div className="mt-14 grid gap-8 lg:grid-cols-2">
              <div className="flex flex-col justify-center space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 shadow-sm">
                <span className="inline-flex w-fit rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  Analytics & Metering
                </span>
                <h3 className="text-2xl font-bold text-slate-900">
                  Granular Token & Latency Attribution
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Track prompt tokens, completion tokens, execution cost in micro-dollars, and p95
                  latency trends across every project and provider. Easily export usage reports and
                  isolate expensive model queries.
                </p>
                <div className="pt-2">
                  <Link
                    href="/demo"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    View in Demo Workspace <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>

              <div className="flex flex-col justify-center space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 shadow-sm">
                <span className="inline-flex w-fit rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  Spend Governance
                </span>
                <h3 className="text-2xl font-bold text-slate-900">
                  Hard Pre-Flight Budget Cutoffs
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Allocate monthly budgets per tenant and team. Tollbooth checks worst-case token costs
                  in Redis before calling providers and returns an immediate 403 when limits are
                  exhausted, completely stopping runaway API costs.
                </p>
                <div className="pt-2">
                  <Link
                    href="/demo"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Inspect Budget Controls <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Use Cases */}
        <section id="use-cases" className="border-t border-slate-200 bg-slate-50/70 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Practical Applications
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Built for Engineering Teams & SaaS Platforms
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {USE_CASES.map((uc) => (
                <div
                  key={uc.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                >
                  <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {uc.badge}
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-slate-900">{uc.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{uc.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 8. Technology & Architecture Section */}
        <section className="border-t border-slate-200 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Under The Hood
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Production-Grade Distributed Stack
              </p>
              <p className="mt-4 text-base text-slate-600">
                Every component is deployed with clear failure boundaries, atomic concurrency, and
                observable metrics.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TECH_STACK.map((tech) => (
                <div
                  key={tech.name}
                  className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 transition-colors hover:bg-slate-100/80"
                >
                  <p className="font-mono text-sm font-bold text-slate-900">{tech.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{tech.role}</p>
                </div>
              ))}
            </div>

            {/* Architecture Highlights & Docs */}
            <div className="mt-14 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
              <h3 className="text-lg font-bold text-slate-900">Architecture Decision Records</h3>
              <p className="mt-1 text-sm text-slate-600">
                Key design decisions documented in the repository for distributed failure handling.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {HIGHLIGHTS.map((item) => (
                  <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="font-semibold text-slate-900">{item.title}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.body}</p>
                    <a
                      href={doc(item.where)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                    >
                      <span>{item.where}</span>
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 9. Final Call to Action */}
        <section className="relative overflow-hidden bg-[#0B1220] py-20 text-white sm:py-24">
          <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-30" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/20 blur-3xl" />

          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              Take Control of Your AI Infrastructure
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-slate-300">
              Join teams running multi-tenant AI applications with predictable costs, unified
              metering, and zero vendor lock-in.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/demo"
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'h-12 bg-blue-600 px-8 font-semibold text-white shadow-xl shadow-blue-600/30 hover:bg-blue-500',
                )}
              >
                Explore Live Demo <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'h-12 border-slate-700 bg-slate-900/90 px-8 font-medium text-slate-200 hover:bg-slate-800 hover:text-white',
                )}
              >
                Explore Source Code
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* 10. Footer */}
      <footer className="border-t border-slate-800 bg-[#070C16] text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Logo href="/" light />
            <span className="text-xs text-slate-500">| Distributed AI Gateway</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs">
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-white">
              Workflow
            </a>
            <a href={doc('docs/architecture/system-design.md')} className="hover:text-white">
              System Architecture
            </a>
            <Link href="/demo" className="hover:text-white">
              Demo Workspace
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign In
            </Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-white">
              GitHub Repository
            </a>
          </div>

          <p className="text-xs text-slate-500">MIT Licensed Open Source Architecture.</p>
        </div>
      </footer>
    </div>
  );
}
