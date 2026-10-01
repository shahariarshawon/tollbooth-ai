'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useUnreadAlerts } from './hooks';

/** Task 5's "notification badge in navbar": a bell linking to /dashboard/alerts, with the unread count
 *  from the same endpoint the alerts page itself uses. No permission check: alerts have none either. */
export function NotificationBell() {
  const unread = useUnreadAlerts();
  const count = unread.data?.length ?? 0;

  return (
    <Link
      href="/dashboard/alerts"
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={count > 0 ? `Alerts, ${count} unread` : 'Alerts'}
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex size-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-medium leading-none text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
