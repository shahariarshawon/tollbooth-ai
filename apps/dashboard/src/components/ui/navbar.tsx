import * as React from 'react';
import Link from 'next/link';
import { Gauge, Menu } from 'lucide-react';
import { Button } from './button';

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Gauge className="size-4" aria-hidden />
      </span>
      Tollbooth AI
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
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
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
