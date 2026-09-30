import { loadConfig } from './env';

const validEnv = {
  PORT: '3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  KAFKA_BROKER: 'localhost:9094',
  JWT_SECRET: 'a-secret-that-is-long-enough',
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
