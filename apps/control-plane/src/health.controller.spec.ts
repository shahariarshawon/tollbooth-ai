import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok for the control-plane service', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('control-plane');
  });
});
