import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok for the gateway service', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('gateway');
  });
});
