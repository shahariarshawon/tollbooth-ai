'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Logo, Navbar } from '@/components/ui/navbar';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/states';
import { NotificationBell } from '@/features/alerts/notification-bell';
import { useAuth } from '@/features/auth/auth-provider';
import { DemoBanner } from '@/features/auth/demo-banner';
import { AppSidebar } from '@/features/navigation/app-sidebar';
import { TenantScopePicker } from '@/features/navigation/tenant-scope-picker';
import { UserMenu } from '@/features/navigation/user-menu';

function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-background" role="status" aria-label="Loading">
      <div className="flex h-14 items-center justify-between border-b border-border px-6">
        <Skeleton className="h-6 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      </div>
      <div className="flex flex-1">
        <div className="hidden h-[calc(100dvh-3.5rem)] w-60 border-r border-border p-4 lg:block">
          <div className="space-y-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-6 p-6 sm:p-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => setNavOpen(false), [pathname]);
  React.useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') return <ShellSkeleton />;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="sticky top-0 z-40 bg-background">
        <DemoBanner />
        <Navbar onMenuClick={() => setNavOpen(true)}>
          <div className="hidden items-center gap-2 xl:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Gateway 100% Operational
            </span>
          </div>
          <TenantScopePicker className="hidden w-48 md:block" />
          <NotificationBell />
          <UserMenu />
        </Navbar>
      </div>

      <div className="flex flex-1">
        {/* Desktop: sticky sidebar with footer info */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col justify-between overflow-y-auto border-r border-border bg-card lg:flex">
          <AppSidebar />
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold text-foreground">Tollbooth v2.0</span>
              </div>
              <a
                href="https://github.com/shahariarshawon/tollbooth-ai"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground"
                aria-label="View on GitHub"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </aside>

        {/* Mobile drawer */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
            <div className="flex h-14 items-center border-b border-border px-4">
              <Logo />
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto p-2">
              <TenantScopePicker className="mx-2 mt-2 w-auto md:hidden" />
              <AppSidebar onNavigate={() => setNavOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
