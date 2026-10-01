import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AlertService } from '../alerts/alert.service';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { logEvent } from '../common/logging/structured-logger';
import type { GatewayRequest } from '../common/types/gateway-request';
import { SecurityService } from './security.service';

/**
 * Task 6's "AI Security Check" step, between the budget check and the provider router. It runs as a
 * guard — reading the request body directly, the way BudgetGuard reads headers — rather than inside
 * GatewayService, so it happens before any provider work and in the same place as the other
 * early-rejection checks.
 *
 * It reads `request.body` before NestJS's validation pipe has transformed it into a
 * `ChatCompletionRequestDto` (guards run first in the request lifecycle), so it is deliberately
 * tolerant of a body that does not look like a chat completion yet: there is nothing to check, this
 * guard allows the request, and DTO validation rejects it properly right afterward with a clearer error.
 */
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    private readonly security: SecurityService,
    private readonly alerts: AlertService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const text = extractMessageText(request.body);
    if (text.length === 0) return true;

    const result = await this.security.check(text);
    if (result.blocked) {
      const types = result.issues.map((issue) => issue.type).join(', ') || 'content policy';
      logEvent(
        {
          event: 'security_check_blocked',
          requestId: request.id,
          tenantId: request.auth?.tenantId ?? null,
          issueTypes: result.issues.map((issue) => issue.type),
        },
        'warn',
      );
      if (request.auth) {
        void this.alerts.create(
          request.auth.tenantId,
          'SECURITY_ALERT',
          `A request was blocked by the content safety check (${types}).`,
          'CRITICAL',
        );
      }
      throw GatewayErrors.contentPolicyViolation(
        `The request was blocked by the content safety check (${types}).`,
      );
    }
    return true;
  }
}

/** All `messages[].content` strings, joined; `''` when the body does not have that shape yet. */
function extractMessageText(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const messages = (body as Record<string, unknown>)['messages'];
  if (!Array.isArray(messages)) return '';
  return messages
    .map((message) =>
      typeof message === 'object' && message !== null
        ? (message as Record<string, unknown>)['content']
        : undefined,
    )
    .filter((content): content is string => typeof content === 'string')
    .join('\n');
}
