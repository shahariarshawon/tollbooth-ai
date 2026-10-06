import * as React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A short, persistent note about what a page does and does not do. It exists so a screen never implies
 * more than the system delivers, for example a setting that is saved but not yet applied.
 */
function Notice({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground',
        className,
      )}
      {...props}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export { Notice };
