'use client';

import * as React from 'react';
import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { ProviderCostSummary } from '@/types/api';

interface ProviderBreakdownCardProps {
  breakdown: ProviderCostSummary[];
  totalUsage: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  GOOGLE: 'bg-blue-500',
  OPENAI: 'bg-emerald-500',
  ANTHROPIC: 'bg-amber-500',
};

export function ProviderBreakdownCard({ breakdown, totalUsage }: ProviderBreakdownCardProps) {
  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Provider Cost Breakdown</h3>
          </div>
          <span className="text-xs text-muted-foreground">Month-to-date</span>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          {breakdown.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No provider activity recorded for this period.
            </div>
          ) : (
            <div className="space-y-3">
              {breakdown.map((item) => {
                const color = PROVIDER_COLORS[item.provider] ?? 'bg-primary';
                return (
                  <div key={item.provider} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        <span className={`size-2.5 rounded-full ${color}`} />
                        {item.provider}
                      </span>
                      <div className="space-x-2">
                        <span className="text-muted-foreground">
                          {item.requests.toLocaleString()} reqs ({item.tokens.toLocaleString()} tok)
                        </span>
                        <span className="font-bold text-foreground">
                          ${item.cost.toFixed(4)} ({item.percentage}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full ${color} transition-all duration-500`}
                        style={{ width: `${Math.max(item.percentage, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </div>

      <div className="border-t p-4 text-xs text-muted-foreground flex justify-between items-center">
        <span>Total calculated cost</span>
        <span className="font-semibold text-foreground">${totalUsage.toFixed(4)}</span>
      </div>
    </Card>
  );
}
