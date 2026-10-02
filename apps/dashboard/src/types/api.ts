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
  teamId?: string | null;
  team?: { id: string; name: string } | null;
  allowedModels?: string[];
  monthlyBudget?: number | null;
  apiKeysCount?: number;
  requestsCount?: number;
  totalTokens?: number;
  totalCost?: number;
  currentSpendMonth?: number;
  createdAt: string;
  updatedAt: string;
}

export type ApiKeyStatus = 'ACTIVE' | 'REVOKED';

/** An API key as stored. There is deliberately no field for the secret: it is shown once, at creation. */
export interface ApiKey {
  id: string;
  projectId: string;
  projectName: string;
  teamId?: string | null;
  teamName?: string | null;
  name: string;
  /** First characters of the key, safe to display. */
  keyPrefix: string;
  permissions: string[];
  /** Requests per minute; null means the plan default. */
  rateLimit: number | null;
  status: ApiKeyStatus;
  expiresAt?: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  requestsCount?: number;
  totalRequests?: number;
  totalTokens?: number;
  totalCost?: number;
}

export type TeamMemberRole = 'LEAD' | 'MEMBER' | 'VIEWER';

export interface TeamMember {
  id: string;
  userId: string;
  role: TeamMemberRole;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  rateLimitRpm: number | null;
  rateLimitRpd: number | null;
  tokenLimitTpm: number | null;
  tokenLimitTpd: number | null;
  dailyBudget: number | null;
  monthlyBudget: number | null;
  allowedModels: string[];
  membersCount: number;
  projectsCount: number;
  apiKeysCount: number;
  members: TeamMember[];
  currentUsageCost: number;
  currentTokens: number;
  currentRequests: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCostSummary {
  provider: string;
  requests: number;
  tokens: number;
  cost: number;
  percentage: number;
}

export interface BillingSummary {
  currentPlan: {
    name: string;
    code: string;
    monthlyPrice: number;
    description: string | null;
    features: string[];
    status: string;
  };
  monthlyLimit: number;
  currentUsage: number;
  remainingBudget: number;
  estimatedCost: number;
  totalTokens: number;
  providerBreakdown: ProviderCostSummary[];
}

export interface BillingPlanItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  monthlyPrice: number;
  monthlyBudgetLimit: number;
  dailyBudgetLimit: number | null;
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
  features: string[];
  isActive: boolean;
}

export interface BillingHistoryItem {
  id: string;
  transactionType: string;
  amount: number;
  currency: string;
  description: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
  actor: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GeneralSettings {
  orgName: string;
  logoUrl: string;
  timezone: string;
  contactEmail: string;
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number;
  passwordMinLength: number;
  requireSpecialChar: boolean;
  defaultKeyExpiryDays: number;
}

export interface AiSettings {
  defaultProvider: string;
  allowedModels: string[];
  maxInputTokens: number;
  maxOutputTokens: number;
}

export interface NotificationSettings {
  emailAlerts: boolean;
  alertEmail: string;
  budgetThresholds: number[];
  notifyOnKeyRevoke: boolean;
  budgetAlertThresholdPercent?: number;
  dailyDigestEnabled?: boolean;
}

export interface SystemSettings {
  maintenanceMode: boolean;
  featureFlags: Record<string, boolean>;
  teamLimitsEnabled?: boolean;
  streamingEnabled?: boolean;
  piiMaskingEnabled?: boolean;
  promptGuardEnabled?: boolean;
}

export interface AllSettings {
  general: GeneralSettings;
  security: SecuritySettings;
  ai: AiSettings;
  notifications: NotificationSettings;
  system: SystemSettings;
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

// ---------------------------------------------------------------------------
// Alerts (Phase 11). Real endpoints on the control plane (apps/control-plane/src/alerts), written by
// the gateway when it detects a budget, provider or security event (apps/gateway/src/alerts).
// ---------------------------------------------------------------------------

export type AlertType = 'BUDGET_LIMIT' | 'HIGH_USAGE' | 'PROVIDER_ERROR' | 'SECURITY_ALERT';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'UNREAD' | 'READ';

export interface Alert {
  id: string;
  type: AlertType;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  createdAt: string;
  readAt: string | null;
}
