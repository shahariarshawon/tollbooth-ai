import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { GatewayErrors, GatewayException } from '../errors/gateway.exception';
import type { ErrorPayload } from '../errors/gateway.exception';
import type { GatewayRequest } from '../types/gateway-request';

/**
 * Every failure leaves the gateway as `{ "error": { message, type, param, code } }`, the same shape
 * OpenAI clients already parse. Anything unexpected is logged here, with its request id, and the client
 * only ever sees a generic 500: no stack traces, database errors or provider details.
 */
@Catch()
export class OpenAiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(OpenAiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const { status, payload } = this.toResponse(exception, http.getRequest<GatewayRequest>());
    http
      .getResponse<Response>()
      .status(status)
      .json({ error: { param: null, ...payload } });
  }

  private toResponse(
    exception: unknown,
    request: GatewayRequest,
  ): { status: number; payload: ErrorPayload } {
    if (exception instanceof GatewayException) {
      return { status: exception.getStatus(), payload: exception.payload };
    }

    if (exception instanceof HttpException) {
      // Framework errors. The application itself only throws GatewayException, so a bare 400 or 413
      // here comes from the JSON body parser (Nest wraps its errors); anything else is an unknown route.
      const status = exception.getStatus();
      if (status === 404) return { status, payload: GatewayErrors.notFound().payload };
      if (status === 400) {
        return {
          status,
          payload: {
            message: 'The request body is not valid JSON.',
            type: 'invalid_request_error',
            code: 'invalid_json',
          },
        };
      }
      if (status === 413) {
        return {
          status,
          payload: {
            message: 'The request body is too large.',
            type: 'invalid_request_error',
            code: 'request_too_large',
          },
        };
      }
      return {
        status,
        payload: {
          message: 'The request could not be processed.',
          type: 'invalid_request_error',
          code: 'invalid_request',
        },
      };
    }

    // Errors raised by the body parser before any controller runs.
    const parserError = exception as { type?: unknown; status?: unknown };
    if (parserError?.type === 'entity.parse.failed') {
      return {
        status: 400,
        payload: {
          message: 'The request body is not valid JSON.',
          type: 'invalid_request_error',
          code: 'invalid_json',
        },
      };
    }
    if (parserError?.type === 'entity.too.large') {
      return {
        status: 413,
        payload: {
          message: 'The request body is too large.',
          type: 'invalid_request_error',
          code: 'request_too_large',
        },
      };
    }

    this.logger.error(
      `Unhandled error (requestId=${request?.id ?? 'unknown'})`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return { status: 500, payload: GatewayErrors.internal().payload };
  }
}
