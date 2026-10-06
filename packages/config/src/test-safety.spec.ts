import { assertLocalTestTargets } from './test-safety';

describe('assertLocalTestTargets', () => {
  it('accepts local databases and caches, including CI service hostnames', () => {
    expect(() =>
      assertLocalTestTargets({
        DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci',
        REDIS_URL: 'redis://127.0.0.1:6379',
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalTestTargets({
        DATABASE_URL: 'postgresql://u:p@postgres:5432/db',
        REDIS_HOST: 'redis',
      }),
    ).not.toThrow();
  });

  it('refuses a hosted database or Redis, naming the host but never the credentials', () => {
    const run = () =>
      assertLocalTestTargets({
        DATABASE_URL: 'postgresql://user:s3cret@aws-0.pooler.supabase.com:5432/postgres',
        REDIS_URL: 'rediss://default:t0ken@x.upstash.io:6379',
      });
    expect(run).toThrow(/pooler\.supabase\.com/);
    expect(run).toThrow(/x\.upstash\.io/);
    expect(run).not.toThrow(/s3cret|t0ken/);
  });

  it('can be overridden explicitly', () => {
    expect(() =>
      assertLocalTestTargets({
        DATABASE_URL: 'postgresql://u:p@db.example.com/x',
        E2E_ALLOW_REMOTE: 'true',
      }),
    ).not.toThrow();
  });

  it('ignores variables that are unset or blank', () => {
    expect(() => assertLocalTestTargets({ REDIS_HOST: '' })).not.toThrow();
  });
});
