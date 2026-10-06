import { loadControlPlaneConfig } from './control-plane';

const validEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-secret-that-is-at-least-32-chars-long',
};

describe('loadControlPlaneConfig', () => {
  it('parses a valid environment and defaults the port', () => {
    const config = loadControlPlaneConfig(validEnv);
    expect(config.PORT).toBe(3001);
    expect(config.NODE_ENV).toBe('development');
  });

  it('lists every missing variable in one message', () => {
    expect(() => loadControlPlaneConfig({})).toThrow(
      /DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*REDIS_URL/,
    );
  });

  it('does not require Kafka or provider settings, which the control plane never reads', () => {
    expect(() => loadControlPlaneConfig(validEnv)).not.toThrow();
  });

  it('prefers CONTROL_PLANE_PORT over the shared PORT, and PORT over the default', () => {
    const port = (env: Record<string, string>) =>
      loadControlPlaneConfig({ ...validEnv, ...env }).PORT;
    expect(port({ PORT: '8080', CONTROL_PLANE_PORT: '8082' })).toBe(8082);
    expect(port({ PORT: '8080' })).toBe(8080);
    expect(port({})).toBe(3001);
  });
});

describe('auth settings', () => {
  it('applies defaults', () => {
    const config = loadControlPlaneConfig(validEnv);
    expect(config.JWT_ACCESS_EXPIRE).toBe('15m');
    expect(config.JWT_REFRESH_EXPIRE).toBe('7d');
    expect(config.BCRYPT_ROUNDS).toBe(12);
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadControlPlaneConfig({ ...validEnv, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejects malformed durations and weak or absurd bcrypt cost', () => {
    expect(() => loadControlPlaneConfig({ ...validEnv, JWT_ACCESS_EXPIRE: 'soon' })).toThrow(
      /JWT_ACCESS_EXPIRE/,
    );
    expect(() => loadControlPlaneConfig({ ...validEnv, JWT_REFRESH_EXPIRE: '7 days' })).toThrow(
      /JWT_REFRESH_EXPIRE/,
    );
    expect(() => loadControlPlaneConfig({ ...validEnv, BCRYPT_ROUNDS: '4' })).toThrow(
      /BCRYPT_ROUNDS/,
    );
    expect(() => loadControlPlaneConfig({ ...validEnv, BCRYPT_ROUNDS: '20' })).toThrow(
      /BCRYPT_ROUNDS/,
    );
  });

  it('treats a blank BCRYPT_ROUNDS as unset', () => {
    expect(loadControlPlaneConfig({ ...validEnv, BCRYPT_ROUNDS: '' }).BCRYPT_ROUNDS).toBe(12);
  });
});

describe('demo and proxy settings', () => {
  it('keeps the demo off and the proxy untrusted by default', () => {
    const config = loadControlPlaneConfig(validEnv);
    expect(config.DEMO_MODE).toBe(false);
    expect(config.DEMO_SESSION_MINUTES).toBe(30);
    expect(config.DEMO_USER_EMAIL).toBeUndefined();
    expect(config.TRUST_PROXY_HOPS).toBe(0);
  });

  it('reads explicit values', () => {
    const config = loadControlPlaneConfig({
      ...validEnv,
      DEMO_MODE: 'true',
      DEMO_SESSION_MINUTES: '45',
      DEMO_USER_EMAIL: 'someone@demo.invalid',
      TRUST_PROXY_HOPS: '1',
    });
    expect(config).toMatchObject({
      DEMO_MODE: true,
      DEMO_SESSION_MINUTES: 45,
      DEMO_USER_EMAIL: 'someone@demo.invalid',
      TRUST_PROXY_HOPS: 1,
    });
  });

  it('rejects a DEMO_MODE that is not exactly true or false', () => {
    expect(() => loadControlPlaneConfig({ ...validEnv, DEMO_MODE: 'yes' })).toThrow(/DEMO_MODE/);
  });

  it('bounds the session length and the proxy count', () => {
    expect(() => loadControlPlaneConfig({ ...validEnv, DEMO_SESSION_MINUTES: '1' })).toThrow(
      /DEMO_SESSION_MINUTES/,
    );
    expect(() => loadControlPlaneConfig({ ...validEnv, DEMO_SESSION_MINUTES: '1000' })).toThrow(
      /DEMO_SESSION_MINUTES/,
    );
    expect(() => loadControlPlaneConfig({ ...validEnv, TRUST_PROXY_HOPS: '-1' })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
    expect(() => loadControlPlaneConfig({ ...validEnv, TRUST_PROXY_HOPS: '9' })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
  });
});
