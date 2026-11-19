import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface SidebarProps {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}

/** Presentational navigation list. Which items appear is decided by the caller. */
function Sidebar({ items, pathname, onNavigate, className }: SidebarProps) {
  return (
    <nav aria-label="Main" className={cn('flex flex-col gap-1 p-3', className)}>
      {items.map(({ label, href, icon: Icon }) => {
        // The dashboard root matches exactly so it is not highlighted on every sub-page.
        const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs dark:bg-blue-950/40 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800/60',
            )}
          >
            <Icon
              className={cn(
                'size-4 shrink-0 transition-colors',
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-400 group-hover:text-foreground dark:text-slate-500',
              )}
              aria-hidden
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export { Sidebar };
