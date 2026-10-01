'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { billingService } from '@/services/billing.service';
import type {
  AssignSubscriptionInput,
  UpdateBillingLimitsInput,
} from '@/services/billing.service';

export function useBillingSummary() {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['billing-summary', scope],
    queryFn: billingService.getSummary,
  });
}

export function useBillingHistory(page = 1, limit = 10) {
  const scope = useTenantScope();
  return useQuery({
    queryKey: ['billing-history', scope, page, limit],
    queryFn: () => billingService.getHistory(page, limit),
  });
}

export function useBillingPlans() {
  return useQuery({
    queryKey: ['billing-plans'],
    queryFn: billingService.listPlans,
  });
}

export function useBillingMutations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-history'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);

  return {
    assignSubscription: useMutation({
      mutationFn: (input: AssignSubscriptionInput) =>
        billingService.assignSubscription(input),
      onSuccess: refresh,
    }),
    updateLimits: useMutation({
      mutationFn: (input: UpdateBillingLimitsInput) =>
        billingService.updateLimits(input),
      onSuccess: refresh,
    }),
  };
}
