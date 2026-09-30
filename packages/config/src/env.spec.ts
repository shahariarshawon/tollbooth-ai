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
    expect(config.GATEWAY_PROVIDER_TIMEOUT_MS).toBe(60000);
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
