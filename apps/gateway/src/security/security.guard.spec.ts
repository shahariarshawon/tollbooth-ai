import type { ExecutionContext } from '@nestjs/common';
import { GatewayException } from '../common/errors/gateway.exception';
import type { GatewayRequest } from '../common/types/gateway-request';
import { SecurityGuard } from './security.guard';
import type { SecurityService } from './security.service';

function contextWithBody(body: unknown, auth?: Partial<GatewayRequest['auth']>): ExecutionContext {
  const request = { body, id: 'req_1', auth } as unknown as GatewayRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SecurityGuard', () => {
  it('allows the request when the check reports nothing blocked', async () => {
    const security = {
      check: jest.fn().mockResolvedValue({ blocked: false, safe: true, issues: [] }),
    };
    const guard = new SecurityGuard(security as unknown as SecurityService);

    const allowed = await guard.canActivate(
      contextWithBody({ messages: [{ role: 'user', content: 'Hello there' }] }),
    );

    expect(allowed).toBe(true);
    expect(security.check).toHaveBeenCalledWith('Hello there');
  });

  it('joins every message content before checking', async () => {
    const security = {
      check: jest.fn().mockResolvedValue({ blocked: false, safe: true, issues: [] }),
    };
    const guard = new SecurityGuard(security as unknown as SecurityService);

    await guard.canActivate(
      contextWithBody({
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
        ],
      }),
    );

    expect(security.check).toHaveBeenCalledWith('Be brief.\nHi');
  });

  it('throws a 400 content_policy_violation when the check blocks the request', async () => {
    const security = {
      check: jest.fn().mockResolvedValue({
        blocked: true,
        safe: true,
        issues: [{ type: 'email', preview: 'ja**om' }],
      }),
    };
    const guard = new SecurityGuard(security as unknown as SecurityService);

    const promise = guard.canActivate(
      contextWithBody({ messages: [{ role: 'user', content: 'my email is j@example.com' }] }),
    );

    await expect(promise).rejects.toMatchObject({
      payload: { code: 'content_policy_violation', type: 'invalid_request_error' },
    });
    await expect(promise).rejects.toBeInstanceOf(GatewayException);
  });

  it.each([
    ['no body', undefined],
    ['a body with no messages field', { model: 'gemini-2.0-flash' }],
    ['messages that is not an array', { messages: 'nope' }],
    ['messages with no string content', { messages: [{ role: 'user' }] }],
  ])('allows the request through when there is nothing to check: %s', async (_label, body) => {
    const security = { check: jest.fn() };
    const guard = new SecurityGuard(security as unknown as SecurityService);

    await expect(guard.canActivate(contextWithBody(body))).resolves.toBe(true);
    expect(security.check).not.toHaveBeenCalled();
  });
});
