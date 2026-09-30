import { ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { GatewayErrors } from '../errors/gateway.exception';
import { ProviderUnavailableException } from '../errors/traffic.exceptions';
import { OpenAiErrorFilter } from './openai-error.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ id: 'req_test' }),
    }),
  } as unknown as ArgumentsHost;
  new OpenAiErrorFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] as unknown };
}

describe('OpenAiErrorFilter', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('renders the standard invalid key error', () => {
    const { status, body } = run(GatewayErrors.invalidApiKey());
    expect(status).toBe(401);
    expect(body).toEqual({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
        param: null,
        code: 'invalid_api_key',
      },
    });
  });

  it.each([
    [GatewayErrors.modelNotFound('x'), 400, 'model_not_found'],
    [new ProviderUnavailableException(), 503, 'provider_unavailable'],
    [GatewayErrors.keyPermissionDenied('chat:completions'), 403, 'insufficient_permissions'],
  ])('keeps the status and code of a GatewayException', (exception, expectedStatus, code) => {
    const { status, body } = run(exception);
    expect(status).toBe(expectedStatus);
    expect((body as { error: { code: string } }).error.code).toBe(code);
  });

  it('turns an unknown route into the standard 404', () => {
    const { status, body } = run(new NotFoundException('Cannot GET /x'));
    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain('Cannot GET');
  });

  it('hides unexpected errors behind a generic 500 and logs them with the request id', () => {
    const { status, body } = run(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.5/);
    expect((body as { error: { code: string } }).error.code).toBe('internal_error');
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('req_test'),
      expect.any(String),
    );
  });
});
