import * as React from 'react';
import Link from 'next/link';
import { Gauge, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

function Logo({ href = '/dashboard', light = false }: { href?: string; light?: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 font-semibold tracking-tight transition-opacity hover:opacity-90"
    >
      <span className="flex size-7.5 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs">
        <Gauge className="size-4" aria-hidden />
      </span>
      <span className={cn('text-base font-bold tracking-tight', light ? 'text-white' : 'text-foreground')}>
        Tollbooth <span className="rounded bg-blue-500/10 px-1 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">AI</span>
      </span>
    </Link>
  );
}

interface NavbarProps {
  /** Opens the navigation drawer; the menu button only shows below the lg breakpoint. */
  onMenuClick?: () => void;
  children?: React.ReactNode;
}

/** Top bar: logo on the left, caller-provided content (user menu and so on) on the right. */
function Navbar({ onMenuClick, children }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/80 bg-background/95 px-4 backdrop-blur-md sm:px-6">
      {onMenuClick && (
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <Menu />
        </Button>
      )}
      <Logo />
      <div className="ml-auto flex items-center gap-3">{children}</div>
    </header>
  );
}

export { Navbar, Logo };
