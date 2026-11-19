'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
    <div className="min-h-dvh" role="status" aria-label="Loading">
      <div className="flex h-14 items-center border-b border-border px-6">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex flex-col gap-4 p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
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
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-40 bg-background">
        <DemoBanner />
        <Navbar onMenuClick={() => setNavOpen(true)}>
          <TenantScopePicker className="hidden w-44 md:block" />
          <NotificationBell />
          <UserMenu />
        </Navbar>
      </div>

      <div className="flex flex-1">
        {/* Desktop: sticky sidebar. Below lg the same navigation opens as the drawer below. */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border bg-card lg:block">
          <AppSidebar />
        </aside>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
            <div className="flex h-14 items-center border-b border-border px-4">
              <Logo />
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto">
              <TenantScopePicker className="mx-3 mt-3 w-auto md:hidden" />
              <AppSidebar onNavigate={() => setNavOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
