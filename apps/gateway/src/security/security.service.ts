import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { SecurityServiceUnavailableException } from './security.exceptions';

export interface SecurityIssue {
  type: string;
  preview: string;
}

export interface SecurityCheckResult {
  blocked: boolean;
  safe: boolean;
  issues: SecurityIssue[];
}

/** Never blocks, and reports nothing: used only when the check itself could not be completed and the
 *  gateway is configured to fail open (GATEWAY_SECURITY_FAIL_OPEN=true). */
const UNCHECKED_RESULT: SecurityCheckResult = { blocked: false, safe: true, issues: [] };

/**
 * The gateway's client for the AI Security Service (`apps/ai-service`). One call, `check()`, covers PII,
 * prompt injection and the content filter (POST /security/check): the gateway needs one round trip per
 * request, not one per kind of check.
 *
 * What happens when the service cannot be reached is a policy choice, `GATEWAY_SECURITY_FAIL_OPEN`:
 * false (default) answers 503, because the content genuinely was not checked; true lets the request
 * through unchecked. The same choice Redis already makes for traffic control (`GATEWAY_FAIL_OPEN`).
 */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async check(text: string): Promise<SecurityCheckResult> {
    try {
      const response = await fetch(
        `${this.config.AI_SERVICE_URL.replace(/\/+$/, '')}/security/check`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(this.config.GATEWAY_SECURITY_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`AI Security Service responded with ${response.status}`);
      }
      return (await response.json()) as SecurityCheckResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI security check failed: ${message}`);
      if (this.config.GATEWAY_SECURITY_FAIL_OPEN) {
        return UNCHECKED_RESULT;
      }
      throw new SecurityServiceUnavailableException();
    }
  }
}
