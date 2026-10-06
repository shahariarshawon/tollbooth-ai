import {
  CircleCheck,
  CircleHelp,
  CircleOff,
  CirclePause,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ProviderHealth, ProviderStatusRow } from '@tollbooth/shared';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { formatNumber } from '@/utils/format';

/** Status is never colour alone: every state has its own icon and its own word. */
const HEALTH: Record<
  ProviderHealth,
  { label: string; icon: LucideIcon; variant: BadgeProps['variant'] }
> = {
  HEALTHY: { label: 'Healthy', icon: CircleCheck, variant: 'success' },
  DEGRADED: { label: 'Degraded', icon: TriangleAlert, variant: 'warning' },
  DOWN: { label: 'Down', icon: XCircle, variant: 'destructive' },
  IDLE: { label: 'No recent traffic', icon: CirclePause, variant: 'muted' },
  DISABLED: { label: 'Disabled', icon: CircleOff, variant: 'muted' },
};

const CIRCUIT_TEXT = {
  CLOSED: 'Circuit closed',
  OPEN: 'Circuit open',
  HALF_OPEN: 'Circuit half-open',
} as const;

const circuitText = (circuit: ProviderStatusRow['circuit']): string =>
  circuit === null ? 'Circuit unknown' : CIRCUIT_TEXT[circuit];

/**
 * Which providers the gateway can route to, whether its circuit breaker is letting calls through, and
 * how this tenant's calls in the last hour went.
 */
export function ProviderHealthCard({ providers }: { providers: ProviderStatusRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider health</CardTitle>
        <CardDescription>Circuit breaker state and your calls in the last hour.</CardDescription>
      </CardHeader>
      <CardContent>
        {providers.length === 0 ? (
          <EmptyState title="No providers configured" icon={CircleHelp} className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {providers.map((provider) => {
              const { label, icon: Icon, variant } = HEALTH[provider.health];
              return (
                <li
                  key={provider.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {circuitText(provider.circuit)} · {formatNumber(provider.recentRequests)}{' '}
                      {provider.recentRequests === 1 ? 'call' : 'calls'}
                      {provider.recentFailures > 0 &&
                        `, ${formatNumber(provider.recentFailures)} failed`}
                    </p>
                  </div>
                  <Badge variant={variant} className="gap-1.5">
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
