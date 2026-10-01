import type { UserRole } from '@tollbooth/shared';

export type { UserRole };

export type TenantPlan = 'FREE' | 'STARTUP' | 'BUSINESS' | 'ENTERPRISE';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';
export type AssignableRole = Exclude<UserRole, 'SUPER_ADMIN'>;

/** The signed-in user, as returned by the control plane at login. */
export interface SessionUser {
  id: string;
  tenantId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageParams {
  limit?: number;
  offset?: number;
}

export interface Tenant {
  id: string;
  companyName: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  tenantId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export type ApiKeyStatus = 'ACTIVE' | 'REVOKED';

/** An API key as stored. There is deliberately no field for the secret: it is shown once, at creation. */
export interface ApiKey {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  /** First characters of the key, safe to display. */
  keyPrefix: string;
  permissions: string[];
  /** Requests per minute; null means the plan default. */
  rateLimit: number | null;
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Returned once by create and rotate. The only place the full key ever appears. */
export interface IssuedApiKey {
  apiKey: ApiKey;
  secret: string;
}

export interface NamedCount {
  label: string;
  value: number;
}

/** A provider the gateway can route to. Active ones serve traffic; available ones are ready but switched off. */
export interface ProviderOverview {
  id: 'gemini' | 'openai' | 'anthropic';
  name: string;
  status: 'ACTIVE' | 'AVAILABLE';
}

export interface DashboardOverview {
  providers: ProviderOverview[];
  stats: {
    totalRequests: number;
    totalTokens: number;
    currentSpend: number;
    activeProjects: number;
  };
  requestVolume: { date: string; requests: number }[];
  costTrend: { date: string; cost: number }[];
  modelUsage: NamedCount[];
  providerUsage: NamedCount[];
}

// ---------------------------------------------------------------------------
// Analytics (Phase 10). Real endpoints on the control plane (apps/control-plane/src/analytics),
// unlike DashboardOverview above, which is still sample data.
// ---------------------------------------------------------------------------

export interface AnalyticsOverview {
  periodDays: number;
  totalRequests: number;
  totalTokens: number;
  /** null when the signed-in role lacks VIEW_BILLING (DEVELOPER). */
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
  /** null when the signed-in role lacks VIEW_BILLING (DEVELOPER). */
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
