import type { BillingHistoryItem, BillingPlanItem, BillingSummary } from '@/types/api';
import { http } from './api-client';

export interface AssignSubscriptionInput {
  planCode: string;
  monthlyBudgetLimit?: number;
  dailyBudgetLimit?: number;
}

export interface UpdateBillingLimitsInput {
  monthlyBudgetLimit?: number;
  dailyBudgetLimit?: number;
}

export const billingService = {
  getSummary: async (): Promise<BillingSummary> =>
    (await http.get<BillingSummary>('/billing/summary')).data,

  getHistory: async (page = 1, limit = 20): Promise<{ items: BillingHistoryItem[]; total: number; page: number; limit: number; totalPages: number }> =>
    (await http.get('/billing/history', { params: { page, limit } })).data,

  listPlans: async (): Promise<BillingPlanItem[]> =>
    (await http.get<BillingPlanItem[]>('/billing/plans')).data,

  assignSubscription: async (input: AssignSubscriptionInput): Promise<unknown> =>
    (await http.post('/billing/subscription', input)).data,

  updateLimits: async (input: UpdateBillingLimitsInput): Promise<unknown> =>
    (await http.patch('/billing/limits', input)).data,
};
