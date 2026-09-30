import { HttpException, HttpStatus } from '@nestjs/common';

/** Error categories, named like the OpenAI API so existing client libraries classify them correctly. */
export type ErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'rate_limit_error'
  | 'budget_error'
  | 'api_error'
  | 'server_error';

export interface ErrorPayload {
  message: string;
  type: ErrorType;
  /** Stable, machine-readable reason. */
  code: string;
  /** The request parameter at fault, when there is one. */
  param?: string | null;
}

/**
 * The only way application code reports a failure to a client. Everything it carries is written to be
 * shown to the caller, so it must never contain internals, provider messages with secrets, or stack traces.
 */
export class GatewayException extends HttpException {
  constructor(
    status: number,
    readonly payload: ErrorPayload,
    /** Response headers to send with the error, for example Retry-After. */
    readonly headers: Record<string, string> = {},
  ) {
    super(payload.message, status);
  }
}

const fail = (status: number, payload: ErrorPayload) => new GatewayException(status, payload);

export const GatewayErrors = {
  missingApiKey: () =>
    fail(HttpStatus.UNAUTHORIZED, {
      message: 'Missing API key. Send it as "Authorization: Bearer tb_...".',
      type: 'authentication_error',
      code: 'missing_api_key',
    }),

  invalidApiKey: () =>
    fail(HttpStatus.UNAUTHORIZED, {
      message: 'Invalid API key',
      type: 'authentication_error',
      code: 'invalid_api_key',
    }),

  accountInactive: () =>
    fail(HttpStatus.FORBIDDEN, {
      message: 'The account or project for this API key is not active.',
      type: 'permission_error',
      code: 'account_inactive',
    }),

  keyPermissionDenied: (permission: string) =>
    fail(HttpStatus.FORBIDDEN, {
      message: `This API key is not allowed to use ${permission}.`,
      type: 'permission_error',
      code: 'insufficient_permissions',
    }),

  invalidRequest: (message: string, param?: string, code = 'invalid_request') =>
    fail(HttpStatus.BAD_REQUEST, {
      message,
      type: 'invalid_request_error',
      code,
      param: param ?? null,
    }),

  modelNotFound: (model: string) =>
    fail(HttpStatus.BAD_REQUEST, {
      message: `The model "${model}" does not exist.`,
      type: 'invalid_request_error',
      code: 'model_not_found',
      param: 'model',
    }),

  modelUnavailable: (model: string) =>
    fail(HttpStatus.BAD_REQUEST, {
      message: `The model "${model}" is not available.`,
      type: 'invalid_request_error',
      code: 'model_unavailable',
      param: 'model',
    }),

  notFound: () =>
    fail(HttpStatus.NOT_FOUND, {
      message: 'Unknown request URL.',
      type: 'invalid_request_error',
      code: 'not_found',
    }),

  internal: () =>
    fail(HttpStatus.INTERNAL_SERVER_ERROR, {
      message: 'The server had an error processing your request.',
      type: 'server_error',
      code: 'internal_error',
    }),
};
