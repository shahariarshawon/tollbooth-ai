import { BadRequestException } from '@nestjs/common';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { BudgetExceededException } from '../common/errors/traffic.exceptions';
import { setLogSink } from '../common/logging/structured-logger';
import type { AppConfig } from '../config/config.module';
import { RedisFailurePolicy } from './redis-failure.policy';

const policy = (failOpen: boolean) =>
  new RedisFailurePolicy({ GATEWAY_FAIL_OPEN: failOpen } as AppConfig);
const redisDown = () => Promise.reject(new Error('Connection is closed.'));

describe('RedisFailurePolicy', () => {
  afterEach(() => setLogSink(null));

  it('returns the operation result when Redis works', async () => {
    await expect(policy(false).guard('test', () => Promise.resolve('ok'), 'bypass')).resolves.toBe(
      'ok',
    );
  });

  it('fails closed by default: a Redis failure becomes a 503', async () => {
    await expect(policy(false).guard('rate_limit', redisDown, 'bypass')).rejects.toMatchObject({
      status: 503,
      payload: { code: 'traffic_control_unavailable', type: 'api_error' },
    });
  });

  it('fails open when configured: the bypass value is returned', async () => {
    await expect(policy(true).guard('rate_limit', redisDown, 'bypass')).resolves.toBe('bypass');
  });

  it('never hides a real rejection, even when failing open', async () => {
    await expect(
      policy(true).guard('budget', () => Promise.reject(new BudgetExceededException()), null),
    ).rejects.toMatchObject({ status: 402 });
    await expect(
      policy(true).guard('x', () => Promise.reject(GatewayErrors.invalidApiKey()), null),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('treats an unexpected error from the operation as a Redis failure', async () => {
    await expect(
      policy(false).guard('x', () => Promise.reject(new BadRequestException('nope')), null),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('logs the failure without the error stack and says which mode applied', async () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));

    await policy(true).guard('token_quota', redisDown, null);

    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      event: 'traffic_control_redis_failure',
      level: 'error',
      control: 'token_quota',
      failOpen: true,
      message: 'Connection is closed.',
    });
    expect(lines[0]).not.toContain('stack');
  });
});
