import { CircleCheck, CirclePause } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProviderOverview } from '@/types/api';

/**
 * Which AI providers the gateway routes to. Active providers serve traffic; available ones are
 * implemented and ready to switch on, so the product stays provider-agnostic.
 */
export function ProviderStatus({ providers }: { providers: ProviderOverview[] }) {
  const active = providers.filter((provider) => provider.status === 'ACTIVE');
  const available = providers.filter((provider) => provider.status === 'AVAILABLE');

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI providers</CardTitle>
        <CardDescription>Where the gateway sends requests.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <section aria-labelledby="providers-active" className="flex flex-col gap-2">
          <h4
            id="providers-active"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Active
          </h4>
          <ul className="flex flex-wrap gap-2">
            {active.map((provider) => (
              <li key={provider.id}>
                <Badge variant="success" className="gap-1.5 px-3 py-1 text-sm">
                  <CircleCheck className="size-3.5" aria-hidden />
                  {provider.name}
                </Badge>
              </li>
            ))}
            {active.length === 0 && <li className="text-sm text-muted-foreground">None</li>}
          </ul>
        </section>
        <section aria-labelledby="providers-available" className="flex flex-col gap-2">
          <h4
            id="providers-available"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Available
          </h4>
          <ul className="flex flex-wrap gap-2">
            {available.map((provider) => (
              <li key={provider.id}>
                <Badge variant="muted" className="gap-1.5 px-3 py-1 text-sm">
                  <CirclePause className="size-3.5" aria-hidden />
                  {provider.name}
                </Badge>
              </li>
            ))}
            {available.length === 0 && <li className="text-sm text-muted-foreground">None</li>}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
