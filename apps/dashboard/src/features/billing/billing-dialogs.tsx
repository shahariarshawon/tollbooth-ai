'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { BillingPlanItem } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useBillingMutations, useBillingPlans } from './hooks';

interface ChangePlanDialogProps {
  currentPlanCode: string;
  onClose: () => void;
}

export function ChangePlanDialog({ currentPlanCode, onClose }: ChangePlanDialogProps) {
  const { data: plans = [] } = useBillingPlans();
  const [selectedCode, setSelectedCode] = React.useState(currentPlanCode);
  const { assignSubscription } = useBillingMutations();
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      await assignSubscription.mutateAsync({ planCode: selectedCode });
      toast.success(`Successfully switched to ${selectedCode} plan`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change Subscription Plan</DialogTitle>
          <DialogDescription>
            Choose a plan that fits your organization's LLM governance and throughput requirements.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-4">
          {plans.map((p) => {
            const isSelected = selectedCode === p.code;
            return (
              <div
                key={p.code}
                onClick={() => setSelectedCode(p.code)}
                className={`cursor-pointer rounded-lg border p-4 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-border/80 hover:bg-accent/40'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-sm">{p.name}</h4>
                    <span className="text-xl font-bold text-foreground">
                      ${p.monthlyPrice}
                      <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </span>
                  </div>
                  {isSelected && (
                    <span className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Check className="size-3" />
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.description}</p>

                <div className="mt-3 pt-3 border-t text-[11px] space-y-1 text-muted-foreground">
                  <div>Default Limit: ${p.monthlyBudgetLimit}/mo</div>
                  <div>Rate Limit: {p.requestsPerMinute} RPM</div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={assignSubscription.isPending}
            disabled={selectedCode === currentPlanCode}
          >
            Confirm Plan Change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AdjustLimitsDialogProps {
  currentMonthlyLimit: number;
  onClose: () => void;
}

export function AdjustLimitsDialog({ currentMonthlyLimit, onClose }: AdjustLimitsDialogProps) {
  const [monthlyLimit, setMonthlyLimit] = React.useState(String(currentMonthlyLimit));
  const [dailyLimit, setDailyLimit] = React.useState(String(Math.round(currentMonthlyLimit / 10)));
  const { updateLimits } = useBillingMutations();
  const { toast } = useToast();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedMonthly = parseFloat(monthlyLimit);
      const parsedDaily = parseFloat(dailyLimit);
      if (isNaN(parsedMonthly) || parsedMonthly <= 0) {
        toast.error('Monthly limit must be a positive number');
        return;
      }
      await updateLimits.mutateAsync({
        monthlyBudgetLimit: parsedMonthly,
        dailyBudgetLimit: isNaN(parsedDaily) ? undefined : parsedDaily,
      });
      toast.success('Budget limits updated successfully');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Adjust Spending Limits</DialogTitle>
            <DialogDescription>
              Configure monthly and daily budget caps to prevent unexpected AI spend.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field label="Monthly Budget Limit ($)" htmlFor="monthlyLimit">
              <Input
                id="monthlyLimit"
                type="number"
                step="0.01"
                min="1"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                required
              />
            </Field>

            <Field label="Daily Budget Cap ($) - Optional" htmlFor="dailyLimit">
              <Input
                id="dailyLimit"
                type="number"
                step="0.01"
                min="0.1"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={updateLimits.isPending}>
              Save Limits
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
