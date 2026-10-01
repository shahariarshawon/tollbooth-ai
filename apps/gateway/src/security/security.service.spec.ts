import type { AppConfig } from '../config/config.module';
import { SecurityServiceUnavailableException } from './security.exceptions';
import { SecurityService } from './security.service';

const baseConfig = {
  AI_SERVICE_URL: 'http://127.0.0.1:1', // nothing listens here: every call fails to connect
  GATEWAY_SECURITY_TIMEOUT_MS: 500,
  GATEWAY_SECURITY_FAIL_OPEN: false,
} as const;

describe('SecurityService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the parsed result on a successful check', async () => {
    const result = {
      blocked: true,
      safe: false,
      issues: [{ type: 'prompt_injection', preview: 'x' }],
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(result) });

    const service = new SecurityService({ ...baseConfig } as AppConfig);
    await expect(service.check('some text')).resolves.toEqual(result);
  });

  it('sends the text as JSON to AI_SERVICE_URL/security/check', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ blocked: false, safe: true, issues: [] }),
    });

    const service = new SecurityService({
      ...baseConfig,
      AI_SERVICE_URL: 'http://ai:8000/',
    } as AppConfig);
    await service.check('hello');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ai:8000/security/check',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'hello' }),
      }),
    );
  });

  it('fails closed (503) when the service cannot be reached and fail-open is off', async () => {
    const service = new SecurityService({
      ...baseConfig,
      GATEWAY_SECURITY_FAIL_OPEN: false,
    } as AppConfig);
    await expect(service.check('text')).rejects.toBeInstanceOf(SecurityServiceUnavailableException);
  });

  it('fails open (lets it through unchecked) when configured to', async () => {
    const service = new SecurityService({
      ...baseConfig,
      GATEWAY_SECURITY_FAIL_OPEN: true,
    } as AppConfig);
    await expect(service.check('text')).resolves.toEqual({
      blocked: false,
      safe: true,
      issues: [],
    });
  });

  it('treats a non-OK HTTP status the same as an unreachable service', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const service = new SecurityService({
      ...baseConfig,
      GATEWAY_SECURITY_FAIL_OPEN: false,
    } as AppConfig);
    await expect(service.check('text')).rejects.toBeInstanceOf(SecurityServiceUnavailableException);
  });
});
