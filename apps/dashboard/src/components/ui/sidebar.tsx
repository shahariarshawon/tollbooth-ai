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
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export { Sidebar };
