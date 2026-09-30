import type { TenantPlan } from '@tollbooth/database';
import type { Request } from 'express';

/** What the API key guard learns about the caller. Every later step works from this, never from headers. */
export interface ApiKeyAuth {
  apiKeyId: string;
  tenantId: string;
  projectId: string;
  /** The tenant plan, which sets its default limits and budget. */
  plan: TenantPlan;
  permissions: string[];
  /** Requests per minute for this key; null means the plan default. */
  rateLimit: number | null;
}

export interface GatewayRequest extends Request {
  /** Set by the request-context middleware on every request. */
  id: string;
  /** Set by ApiKeyGuard once the key is verified. */
  auth?: ApiKeyAuth;
}
