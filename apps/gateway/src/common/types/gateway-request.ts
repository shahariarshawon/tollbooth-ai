import type { Request } from 'express';

/** What the API key guard learns about the caller. Every later step works from this, never from headers. */
export interface ApiKeyAuth {
  apiKeyId: string;
  tenantId: string;
  projectId: string;
  permissions: string[];
  /** Requests per minute; null means the plan default. Not enforced until rate limiting exists. */
  rateLimit: number | null;
}

export interface GatewayRequest extends Request {
  /** Set by the request-context middleware on every request. */
  id: string;
  /** Set by ApiKeyGuard once the key is verified. */
  auth?: ApiKeyAuth;
}
