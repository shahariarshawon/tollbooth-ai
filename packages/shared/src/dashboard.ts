import type { CircuitState } from './circuit';

/**
 * `GET /dashboard/overview`: everything the dashboard's landing page shows, for one tenant, in one
 * response. Money fields are `null` for callers without VIEW_BILLING, as in /analytics.
 */

export type ProviderHealth = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'IDLE' | 'DISABLED';

export interface ProviderStatusRow {
  /** The gateway's name for the provider: gemini, openai or anthropic. */
  id: string;
  name: string;
  /** Whether the gateway may route to it (the provider row's status). */
  enabled: boolean;
  /** The circuit breaker's state, or null when Redis could not be read. */
  circuit: CircuitState | null;
  health: ProviderHealth;
  /** This tenant's requests to the provider in the last hour. */
  recentRequests: number;
  recentFailures: number;
}

export interface RecentRequestRow {
  id: string;
  createdAt: string;
  provider: string;
  model: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  latencyMs: number | null;
  totalTokens: number;
  /** null without VIEW_BILLING. */
  cost: number | null;
  projectName: string;
  apiKeyName: string;
}

export interface PolicyEventRow {
  id: string;
  type: 'BUDGET_LIMIT' | 'SECURITY_ALERT';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  createdAt: string;
}

export interface DashboardOverview {
  periodDays: number;
  generatedAt: string;
  stats: {
    requests: number;
    tokens: number;
    /** null without VIEW_BILLING. */
    cost: number | null;
    /** Failed requests as a share of all requests, 0 to 1. 0 when there were none. */
    errorRate: number;
    /** 95th percentile latency of requests that reported one. null when none did. */
    p95LatencyMs: number | null;
    activeProjects: number;
    /** Keys that are ACTIVE and not expired. */
    activeApiKeys: number;
  };
  /** One point per day of the period, zero-filled, oldest first. */
  requestVolume: { date: string; requests: number; failures: number }[];
  /** Same days as requestVolume. null without VIEW_BILLING. */
  costTrend: { date: string; cost: number }[] | null;
  modelUsage: { label: string; value: number }[];
  providerUsage: { label: string; value: number }[];
  providers: ProviderStatusRow[];
  /** This month's spend against the monthly budget. null without VIEW_BILLING. */
  budget: { limitUsd: number; spentUsd: number; utilization: number } | null;
  recentRequests: RecentRequestRow[];
  policyEvents: PolicyEventRow[];
}
