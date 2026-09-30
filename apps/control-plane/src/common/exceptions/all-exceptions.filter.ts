import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@tollbooth/database';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/**
 * Turns every failure into a small, predictable JSON body. Database errors, stack traces and
 * other internals are logged on the server and never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return { statusCode: status, message, error: STATUS_TEXT[status] ?? 'Error' };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return this.body(HttpStatus.CONFLICT, 'Resource already exists');
        case 'P2025':
          return this.body(HttpStatus.NOT_FOUND, 'Resource not found');
        case 'P2003':
          return this.body(HttpStatus.CONFLICT, 'The operation conflicts with related data');
      }
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return this.body(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }

  private body(statusCode: number, message: string): ErrorBody {
    return { statusCode, message, error: STATUS_TEXT[statusCode] ?? 'Error' };
  }
}
