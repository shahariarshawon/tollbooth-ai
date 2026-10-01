'use client';

import * as React from 'react';
import { Check, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Current Plan</span>
            <Badge variant="default" className="text-xs">
              {currentPlan.status}
            </Badge>
          </div>
          <span className="text-2xl font-bold">
            ${currentPlan.monthlyPrice}
            <span className="text-xs font-normal text-muted-foreground">/mo</span>
          </span>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> {currentPlan.name}
            </h3>
            {currentPlan.description && (
              <p className="mt-1 text-xs text-muted-foreground">{currentPlan.description}</p>
            )}
          </div>

          <div className="space-y-2 border-t pt-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Included Features
            </span>
            <ul className="space-y-1.5 text-xs">
              {currentPlan.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </div>

      {canManage && (
        <div className="border-t p-4 flex gap-2">
          <Button variant="default" className="flex-1" onClick={onChangePlan}>
            Change Plan
          </Button>
          <Button variant="outline" onClick={onAdjustLimits} title="Adjust Budget Limits">
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
