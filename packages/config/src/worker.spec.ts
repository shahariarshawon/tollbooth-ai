import { loadWorkerConfig } from './worker';

describe('loadWorkerConfig', () => {
  it('needs only Kafka: no database, Redis or auth settings', () => {
    const config = loadWorkerConfig({ KAFKA_BROKER: 'kafka:9092' });
    expect(config).toEqual({ NODE_ENV: 'development', KAFKA_BROKER: 'kafka:9092', PORT: 3003 });
  });

  it('fails without a Kafka broker', () => {
    expect(() => loadWorkerConfig({})).toThrow(/KAFKA_BROKER/);
    expect(() => loadWorkerConfig({ KAFKA_BROKER: '' })).toThrow(/KAFKA_BROKER/);
  });

  it('prefers WORKER_PORT over the shared PORT, and PORT over the default', () => {
    const port = (env: Record<string, string>) =>
      loadWorkerConfig({ KAFKA_BROKER: 'kafka:9092', ...env }).PORT;
    expect(port({ PORT: '9000', WORKER_PORT: '9001' })).toBe(9001);
    expect(port({ PORT: '9000' })).toBe(9000);
  });
});
