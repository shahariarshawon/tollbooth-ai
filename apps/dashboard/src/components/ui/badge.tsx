import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { humanize } from '@/utils/format';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS_VARIANTS: Record<string, NonNullable<BadgeProps['variant']>> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'warning',
  DISABLED: 'muted',
  ARCHIVED: 'muted',
  REVOKED: 'destructive',
  DELETED: 'destructive',
};

/** One mapping from any status string used in the app to a badge colour. */
function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? 'outline'}>{humanize(status)}</Badge>;
}

export { Badge, StatusBadge, badgeVariants };
