'use client';

import * as React from 'react';
import {
  Banknote,
  Coins,
  DollarSign,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { BillingSummary } from '@/types/api';

interface BillingOverviewCardsProps {
  summary: BillingSummary;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(val);
}

function formatTokens(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString();
}

export function BillingOverviewCards({ summary }: BillingOverviewCardsProps) {
  const percentUsed = summary.monthlyLimit > 0
    ? Math.min(100, Math.round((summary.currentUsage / summary.monthlyLimit) * 100))
    : 0;

  const isNearLimit = percentUsed >= 85;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Current Spend & Limit */}
      <Card className="relative overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Current Usage</span>
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <DollarSign className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold">{formatCurrency(summary.currentUsage)}</div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Limit: {formatCurrency(summary.monthlyLimit)}</span>
              <span className={isNearLimit ? 'font-semibold text-destructive' : 'font-medium'}>
                {percentUsed}% spent
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all duration-500 ${
                  isNearLimit ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remaining Budget */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Remaining Budget</span>
            <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-500">
              <Coins className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.remainingBudget)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Available before monthly hard cap
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Estimated Month-End Spend */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Estimated Month-End</span>
            <div className="rounded-md bg-amber-500/10 p-2 text-amber-500">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold">{formatCurrency(summary.estimatedCost)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Projected based on current run rate
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Token Consumption */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Token Consumption</span>
            <div className="rounded-md bg-blue-500/10 p-2 text-blue-500">
              <Zap className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold">{formatTokens(summary.totalTokens)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Total prompt + completion tokens this month
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
