import { durationToSeconds, loadConfig } from './env';

const validEnv = {
  PORT: '3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  KAFKA_BROKER: 'localhost:9094',
  JWT_SECRET: 'a-secret-that-is-at-least-32-chars-long',
};

describe('loadConfig', () => {
  it('parses a valid environment and coerces PORT to a number', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
  });

  it('throws listing every invalid variable', () => {
    expect(() => loadConfig({ ...validEnv, PORT: undefined, JWT_SECRET: 'short' })).toThrow(
      /PORT[\s\S]*JWT_SECRET/,
    );
  });
});

describe('auth settings', () => {
  it('applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.JWT_ACCESS_EXPIRE).toBe('15m');
    expect(config.JWT_REFRESH_EXPIRE).toBe('7d');
    expect(config.BCRYPT_ROUNDS).toBe(12);
  });

  it('rejects malformed durations and weak bcrypt cost', () => {
    expect(() => loadConfig({ ...validEnv, JWT_ACCESS_EXPIRE: 'soon' })).toThrow(
      /JWT_ACCESS_EXPIRE/,
    );
    expect(() => loadConfig({ ...validEnv, BCRYPT_ROUNDS: '4' })).toThrow(/BCRYPT_ROUNDS/);
  });
});

describe('gateway settings', () => {
  it('applies defaults and treats blank values as unset', () => {
    const config = loadConfig({
      ...validEnv,
      OPENAI_API_KEY: '',
      OPENAI_BASE_URL: '',
      GATEWAY_PORT: '',
    });
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
    expect(config.GATEWAY_PORT).toBeUndefined();
    expect(config.GATEWAY_MAX_TOKENS).toBe(4096);
    expect(config.GATEWAY_PROVIDER_TIMEOUT_MS).toBe(30000);
    expect(config.GATEWAY_MAX_PROVIDER_RETRIES).toBe(3);
  });

  it('reads an explicit provider retry count, and rejects a negative one', () => {
    expect(
      loadConfig({ ...validEnv, GATEWAY_MAX_PROVIDER_RETRIES: '0' }).GATEWAY_MAX_PROVIDER_RETRIES,
    ).toBe(0);
    expect(
      loadConfig({ ...validEnv, GATEWAY_MAX_PROVIDER_RETRIES: '5' }).GATEWAY_MAX_PROVIDER_RETRIES,
    ).toBe(5);
    expect(() => loadConfig({ ...validEnv, GATEWAY_MAX_PROVIDER_RETRIES: '-1' })).toThrow();
  });

  it('reads explicit values and rejects a malformed base URL', () => {
    const config = loadConfig({
      ...validEnv,
      GATEWAY_PORT: '8080',
      OPENAI_BASE_URL: 'http://localhost:4010/v1',
      GATEWAY_MAX_TOKENS: '2048',
    });
    expect(config.GATEWAY_PORT).toBe(8080);
    expect(config.OPENAI_BASE_URL).toBe('http://localhost:4010/v1');
    expect(config.GATEWAY_MAX_TOKENS).toBe(2048);
    expect(() => loadConfig({ ...validEnv, OPENAI_BASE_URL: 'not a url' })).toThrow(
      /OPENAI_BASE_URL/,
    );
  });
});

describe('redis and traffic settings', () => {
  it('applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.REDIS_HOST).toBeUndefined();
    expect(config.REDIS_TLS).toBe(false);
    expect(config.REDIS_COMMAND_TIMEOUT_MS).toBe(1000);
    expect(config.GATEWAY_FAIL_OPEN).toBe(false);
    expect(config.GATEWAY_CIRCUIT_FAILURE_THRESHOLD).toBe(5);
    expect(config.GATEWAY_CIRCUIT_OPEN_MS).toBe(30000);
  });

  it('treats blank values as unset, as .env.example ships them', () => {
    const config = loadConfig({
      ...validEnv,
      REDIS_HOST: '',
      REDIS_PORT: '',
      REDIS_PASSWORD: '',
      REDIS_TLS: '',
      GATEWAY_FAIL_OPEN: '',
    });
    expect(config.REDIS_HOST).toBeUndefined();
    expect(config.REDIS_PORT).toBeUndefined();
    expect(config.REDIS_TLS).toBe(false);
    expect(config.GATEWAY_FAIL_OPEN).toBe(false);
  });

  it('reads explicit values', () => {
    const config = loadConfig({
      ...validEnv,
      REDIS_HOST: 'redis.prod',
      REDIS_PORT: '6390',
      REDIS_PASSWORD: 'secret',
      REDIS_TLS: 'true',
      GATEWAY_FAIL_OPEN: 'true',
      GATEWAY_CIRCUIT_FAILURE_THRESHOLD: '3',
      GATEWAY_CIRCUIT_OPEN_MS: '5000',
    });
    expect(config).toMatchObject({
      REDIS_HOST: 'redis.prod',
      REDIS_PORT: 6390,
      REDIS_PASSWORD: 'secret',
      REDIS_TLS: true,
      GATEWAY_FAIL_OPEN: true,
      GATEWAY_CIRCUIT_FAILURE_THRESHOLD: 3,
      GATEWAY_CIRCUIT_OPEN_MS: 5000,
    });
  });

  it('rejects a boolean that is not exactly true or false, so a typo cannot silently change behaviour', () => {
    expect(() => loadConfig({ ...validEnv, GATEWAY_FAIL_OPEN: 'yes' })).toThrow(
      /GATEWAY_FAIL_OPEN/,
    );
    expect(() => loadConfig({ ...validEnv, REDIS_TLS: '1' })).toThrow(/REDIS_TLS/);
  });

  it('rejects out-of-range values', () => {
    expect(() => loadConfig({ ...validEnv, REDIS_PORT: '70000' })).toThrow(/REDIS_PORT/);
    expect(() => loadConfig({ ...validEnv, REDIS_COMMAND_TIMEOUT_MS: '5' })).toThrow(
      /REDIS_COMMAND_TIMEOUT_MS/,
    );
    expect(() => loadConfig({ ...validEnv, GATEWAY_CIRCUIT_FAILURE_THRESHOLD: '0' })).toThrow(
      /GATEWAY_CIRCUIT_FAILURE_THRESHOLD/,
    );
  });
});

describe('provider settings', () => {
  it('makes Gemini the default provider with the public endpoints as defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.GATEWAY_DEFAULT_PROVIDER).toBe('gemini');
    expect(config.GOOGLE_AI_BASE_URL).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(config.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
  });

  it('needs no provider key to load, so no provider is mandatory', () => {
    const config = loadConfig({ ...validEnv, GOOGLE_AI_API_KEY: '', OPENAI_API_KEY: '' });
    expect(config.GOOGLE_AI_API_KEY).toBeUndefined();
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('reads provider keys and a different default provider', () => {
    const config = loadConfig({
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
    expect(() => loadConfig({ ...validEnv, GATEWAY_DEFAULT_PROVIDER: 'cohere' })).toThrow(
      /GATEWAY_DEFAULT_PROVIDER/,
    );
  });
});

describe('durationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['12h', 43200],
    ['7d', 604800],
  ])('converts %s', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });

  it('throws on invalid input', () => {
    expect(() => durationToSeconds('7 days')).toThrow();
  });
});
