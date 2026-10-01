/** Response shapes for every /analytics endpoint. Dates are `YYYY-MM-DD` (daily) or `YYYY-MM` (monthly). */

export interface NamedCount {
  label: string;
  value: number;
}

export interface AnalyticsOverview {
  periodDays: number;
  totalRequests: number;
  totalTokens: number;
  /** null when the caller does not hold VIEW_BILLING (see analytics.controller.ts). */
  totalCost: number | null;
  activeUsers: number;
  activeProjects: number;
}

export interface AnalyticsUsage {
  periodDays: number;
  requestsOverTime: { date: string; requests: number }[];
  tokensOverTime: { date: string; tokens: number }[];
  providerUsage: NamedCount[];
  topProjects: { id: string; name: string; requests: number; tokens: number }[];
  topApiKeys: { id: string; name: string; projectName: string; requests: number; tokens: number }[];
}

export interface ModelUsageRow {
  provider: string;
  model: string;
  requests: number;
  tokens: number;
  /** null when the caller does not hold VIEW_BILLING. */
  cost: number | null;
}

export interface AnalyticsModels {
  periodDays: number;
  models: ModelUsageRow[];
}

export interface AnalyticsCost {
  periodDays: number;
  dailyCost: { date: string; cost: number }[];
  monthlyCost: { month: string; cost: number }[];
  providerCostBreakdown: NamedCount[];
}
