import { ArgumentsHost, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@tollbooth/database';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] as unknown };
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('keeps the message of deliberate HTTP errors', () => {
    const { status, body } = run(new UnauthorizedException('Invalid email or password'));
    expect(status).toBe(401);
    expect(body).toEqual({
      statusCode: 401,
      message: 'Invalid email or password',
      error: 'Unauthorized',
    });
  });

  it('passes validation messages through as a list', () => {
    const { body } = run(new BadRequestException(['email must be an email']));
    expect(body).toMatchObject({ statusCode: 400, message: ['email must be an email'] });
  });

  it('hides database error details behind a generic message', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`) at users_email_key',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['email'] } },
    );
    const { status, body } = run(error);
    expect(status).toBe(409);
    expect(JSON.stringify(body)).not.toMatch(/email|users_|constraint/i);
  });

  it('turns unexpected errors into an opaque 500 and logs them server-side', () => {
    const error = new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
    const { status, body } = run(error);
    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});
