import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { GatewayErrors } from '../errors/gateway.exception';

/** Walks nested errors and returns the first problem with a dotted path such as `messages.0.role`. */
function firstProblem(
  errors: ValidationError[],
  prefix = '',
): { path: string; message: string; unknown: boolean } | null {
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const constraints = error.constraints ?? {};
    if ('whitelistValidation' in constraints) {
      return { path, message: `Unrecognized request parameter: ${path}.`, unknown: true };
    }
    const message = Object.values(constraints)[0];
    if (message) return { path, message, unknown: false };
    const nested = firstProblem(error.children ?? [], path);
    if (nested) return nested;
  }
  return null;
}

/**
 * Validates request bodies against the DTOs. Unknown fields are rejected (not silently ignored), so a
 * client sending something the gateway does not support, such as `tools`, is told so instead of
 * getting a quietly different behaviour from OpenAI.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const problem = firstProblem(errors);
      return GatewayErrors.invalidRequest(
        problem?.message ?? 'Invalid request.',
        problem?.path,
        problem?.unknown ? 'unknown_parameter' : 'invalid_request',
      );
    },
  });
}
