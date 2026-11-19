'use client';

import * as React from 'react';
import { Check, Info, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-provider';
import type { BillingSummary } from '@/types/api';

interface CurrentPlanCardProps {
  summary: BillingSummary;
  canManage: boolean;
  onChangePlan: () => void;
  onAdjustLimits: () => void;
}

export function CurrentPlanCard({
  summary,
  canManage,
  onChangePlan,
  onAdjustLimits,
}: CurrentPlanCardProps) {
  const { currentPlan } = summary;
  const { user } = useAuth();
  const isDemo = Boolean(user?.isDemo);

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Current Plan</span>
            <Badge variant="default" className="text-xs">
              {currentPlan.status}
            </Badge>
            {isDemo && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400"
              >
                Synthetic Demo
              </Badge>
            )}
          </div>
          <span className="text-2xl font-bold">
            ${currentPlan.monthlyPrice}
            <span className="text-xs font-normal text-muted-foreground">/mo tier</span>
          </span>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Sparkles className="size-4 text-primary" /> {currentPlan.name}
            </h3>
            {currentPlan.description && (
              <p className="mt-1 text-xs text-muted-foreground">{currentPlan.description}</p>
            )}
          </div>

          <div className="space-y-2 border-t pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quota & Policy Features
            </span>
            <ul className="space-y-1.5 text-xs">
              {currentPlan.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 shrink-0 text-emerald-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-1.5 rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
            <Info className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/70" />
            <span>
              Plan tiers define internal throughput limits and budget caps. All usage reflects
              estimated upstream model API consumption.
            </span>
          </div>
        </CardContent>
      </div>

      {canManage && (
        <div className="border-t p-4">
          {isDemo ? (
            <div className="rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-400">
              Plan changes and budget adjustments are read-only in the demo workspace.
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="default" className="flex-1" onClick={onChangePlan}>
                Change Plan Tier
              </Button>
              <Button variant="outline" onClick={onAdjustLimits} title="Adjust Spending Guardrails">
                <SlidersHorizontal className="size-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
