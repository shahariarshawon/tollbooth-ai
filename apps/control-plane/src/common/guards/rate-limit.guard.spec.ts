import { ExecutionContext, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InMemoryRateLimitStore } from '../rate-limit/in-memory-rate-limit.store';
import type { RateLimitStore } from '../rate-limit/rate-limit.store';
import { RateLimit } from '../decorators/rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';

class Controller {
  @RateLimit({ name: 'login', windowSeconds: 900, perIp: 4, perEmail: 2 })
  login(): void {}
}

function contextFor(ip: string, email?: string) {
  const headers: Record<string, string> = {};
  const context = {
    getHandler: () => Controller.prototype.login,
    getClass: () => Controller,
    switchToHttp: () => ({
      getRequest: () => ({ ip, body: { email } }),
      getResponse: () => ({ setHeader: (name: string, value: string) => (headers[name] = value) }),
    }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

describe('RateLimitGuard', () => {
  it('blocks an email after its limit, even when the IP changes', async () => {
    const guard = new RateLimitGuard(new Reflector(), new InMemoryRateLimitStore());
    await guard.canActivate(contextFor('10.0.0.1', 'victim@example.com').context);
    await guard.canActivate(contextFor('10.0.0.2', 'victim@example.com').context);

    const blocked = contextFor('10.0.0.3', 'victim@example.com');
    await expect(guard.canActivate(blocked.context)).rejects.toMatchObject({ status: 429 });
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('treats emails case-insensitively', async () => {
    const guard = new RateLimitGuard(new Reflector(), new InMemoryRateLimitStore());
    await guard.canActivate(contextFor('10.0.0.1', 'Victim@Example.com').context);
    await guard.canActivate(contextFor('10.0.0.1', 'victim@example.com').context);
    await expect(
      guard.canActivate(contextFor('10.0.0.1', ' VICTIM@example.com').context),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('blocks an IP after its limit across different emails', async () => {
    const guard = new RateLimitGuard(new Reflector(), new InMemoryRateLimitStore());
    for (let i = 0; i < 4; i++) {
      await guard.canActivate(contextFor('10.9.9.9', `user${i}@example.com`).context);
    }
    await expect(
      guard.canActivate(contextFor('10.9.9.9', 'another@example.com').context),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('does not let one client exhaust the limit of another', async () => {
    const guard = new RateLimitGuard(new Reflector(), new InMemoryRateLimitStore());
    for (let i = 0; i < 3; i++) {
      await guard
        .canActivate(contextFor('10.1.1.1', 'a@example.com').context)
        .catch(() => undefined);
    }
    await expect(guard.canActivate(contextFor('10.2.2.2', 'b@example.com').context)).resolves.toBe(
      true,
    );
  });

  it('fails closed when the store is unavailable', async () => {
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error('ECONNREFUSED')) };
    const guard = new RateLimitGuard(new Reflector(), broken);
    await expect(
      guard.canActivate(contextFor('10.0.0.1', 'a@example.com').context),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
