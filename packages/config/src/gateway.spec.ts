import { loadGatewayConfig } from './gateway';

const validEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  KAFKA_BROKER: 'localhost:9094',
};

describe('loadGatewayConfig', () => {
  it('parses a valid environment and defaults the port and NODE_ENV', () => {
    const config = loadGatewayConfig(validEnv);
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
  });

  it('lists every missing variable in one message', () => {
    expect(() => loadGatewayConfig({})).toThrow(/DATABASE_URL[\s\S]*KAFKA_BROKER[\s\S]*REDIS_URL/);
  });

  it('does not require what only other services consume', () => {
    // No JWT_SECRET or BCRYPT_ROUNDS: the gateway authenticates with API keys, not user sessions.
    expect(() => loadGatewayConfig(validEnv)).not.toThrow();
  });

  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() => loadGatewayConfig({ ...validEnv, DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(
      /DATABASE_URL/,
    );
  });
});

describe('port resolution', () => {
  it('prefers GATEWAY_PORT over the shared PORT, and PORT over the default', () => {
    expect(loadGatewayConfig({ ...validEnv, PORT: '8080', GATEWAY_PORT: '8081' }).PORT).toBe(8081);
    expect(loadGatewayConfig({ ...validEnv, PORT: '8080' }).PORT).toBe(8080);
    expect(loadGatewayConfig({ ...validEnv, PORT: '', GATEWAY_PORT: '' }).PORT).toBe(3000);
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadGatewayConfig({ ...validEnv, PORT: '70000' })).toThrow(/PORT/);
  });
});

describe('gateway settings', () => {
  it('applies defaults and treats blank values as unset', () => {
    const config = loadGatewayConfig({
      ...validEnv,
      OPENAI_API_KEY: '',
      OPENAI_BASE_URL: '',
      GATEWAY_PORT: '',
    });
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
    expect(config.GATEWAY_MAX_TOKENS).toBe(4096);
    expect(config.GATEWAY_PROVIDER_TIMEOUT_MS).toBe(30000);
    expect(config.GATEWAY_MAX_PROVIDER_RETRIES).toBe(3);
    expect(config.AI_SERVICE_URL).toBe('http://localhost:8000');
    expect(config.GATEWAY_SECURITY_TIMEOUT_MS).toBe(3000);
    expect(config.GATEWAY_SECURITY_FAIL_OPEN).toBe(false);
  });

  it('reads explicit AI Security Service settings, and rejects a malformed URL', () => {
    const config = loadGatewayConfig({
      ...validEnv,
      AI_SERVICE_URL: 'http://ai-service:8000',
      GATEWAY_SECURITY_TIMEOUT_MS: '5000',
      GATEWAY_SECURITY_FAIL_OPEN: 'true',
    });
    expect(config.AI_SERVICE_URL).toBe('http://ai-service:8000');
    expect(config.GATEWAY_SECURITY_TIMEOUT_MS).toBe(5000);
    expect(config.GATEWAY_SECURITY_FAIL_OPEN).toBe(true);
    expect(() => loadGatewayConfig({ ...validEnv, AI_SERVICE_URL: 'not-a-url' })).toThrow();
  });

  it('reads an explicit provider retry count, and rejects a negative one', () => {
    const retries = (value: string) =>
      loadGatewayConfig({ ...validEnv, GATEWAY_MAX_PROVIDER_RETRIES: value })
        .GATEWAY_MAX_PROVIDER_RETRIES;
    expect(retries('0')).toBe(0);
    expect(retries('5')).toBe(5);
    expect(() => retries('-1')).toThrow();
  });

  it('reads explicit values and rejects a malformed base URL', () => {
    const config = loadGatewayConfig({
      ...validEnv,
      OPENAI_BASE_URL: 'http://localhost:4010/v1',
      GATEWAY_MAX_TOKENS: '2048',
    });
    expect(config.OPENAI_BASE_URL).toBe('http://localhost:4010/v1');
    expect(config.GATEWAY_MAX_TOKENS).toBe(2048);
    expect(() => loadGatewayConfig({ ...validEnv, OPENAI_BASE_URL: 'not a url' })).toThrow(
      /OPENAI_BASE_URL/,
    );
  });

  it('applies traffic-control defaults and reads explicit overrides', () => {
    const defaults = loadGatewayConfig(validEnv);
    expect(defaults.GATEWAY_FAIL_OPEN).toBe(false);
    expect(defaults.GATEWAY_CIRCUIT_FAILURE_THRESHOLD).toBe(5);
    expect(defaults.GATEWAY_CIRCUIT_OPEN_MS).toBe(30000);

    const explicit = loadGatewayConfig({
      ...validEnv,
      GATEWAY_FAIL_OPEN: 'true',
      GATEWAY_CIRCUIT_FAILURE_THRESHOLD: '3',
      GATEWAY_CIRCUIT_OPEN_MS: '5000',
    });
    expect(explicit).toMatchObject({
      GATEWAY_FAIL_OPEN: true,
      GATEWAY_CIRCUIT_FAILURE_THRESHOLD: 3,
      GATEWAY_CIRCUIT_OPEN_MS: 5000,
    });
  });

  it('rejects a boolean that is not exactly true or false, so a typo cannot silently change behaviour', () => {
    expect(() => loadGatewayConfig({ ...validEnv, GATEWAY_FAIL_OPEN: 'yes' })).toThrow(
      /GATEWAY_FAIL_OPEN/,
    );
    expect(() => loadGatewayConfig({ ...validEnv, GATEWAY_SECURITY_FAIL_OPEN: '1' })).toThrow(
      /GATEWAY_SECURITY_FAIL_OPEN/,
    );
  });

  it('rejects out-of-range values', () => {
    expect(() =>
      loadGatewayConfig({ ...validEnv, GATEWAY_CIRCUIT_FAILURE_THRESHOLD: '0' }),
    ).toThrow(/GATEWAY_CIRCUIT_FAILURE_THRESHOLD/);
    expect(() => loadGatewayConfig({ ...validEnv, GATEWAY_PROVIDER_TIMEOUT_MS: '10' })).toThrow(
      /GATEWAY_PROVIDER_TIMEOUT_MS/,
    );
  });
});

describe('provider settings', () => {
  it('makes Gemini the default provider with the public endpoints as defaults', () => {
    const config = loadGatewayConfig(validEnv);
    expect(config.GATEWAY_DEFAULT_PROVIDER).toBe('gemini');
    expect(config.GOOGLE_AI_BASE_URL).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(config.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
  });

  it('needs no provider key to load, so no provider is mandatory', () => {
    const config = loadGatewayConfig({ ...validEnv, GOOGLE_AI_API_KEY: '', OPENAI_API_KEY: '' });
    expect(config.GOOGLE_AI_API_KEY).toBeUndefined();
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('reads provider keys and a different default provider', () => {
    const config = loadGatewayConfig({
      ...validEnv,
      GOOGLE_AI_API_KEY: 'g-key',
      GATEWAY_DEFAULT_PROVIDER: 'openai',
      GOOGLE_AI_BASE_URL: 'http://localhost:4020/v1beta',
    });
    expect(config).toMatchObject({
      GOOGLE_AI_API_KEY: 'g-key',
      GATEWAY_DEFAULT_PROVIDER: 'openai',
      GOOGLE_AI_BASE_URL: 'http://localhost:4020/v1beta',
    });
  });

  it('rejects an unknown default provider', () => {
    expect(() => loadGatewayConfig({ ...validEnv, GATEWAY_DEFAULT_PROVIDER: 'cohere' })).toThrow(
      /GATEWAY_DEFAULT_PROVIDER/,
    );
  });
});
