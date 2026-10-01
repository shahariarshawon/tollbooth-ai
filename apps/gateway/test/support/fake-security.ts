import { startFakeProvider } from './fake-server';
import type { FakeProvider, Responder } from './fake-server';

/**
 * A stand-in for the AI Security Service's `POST /security/check`. Defaults to `'ok'` (nothing found),
 * so every existing gateway test is unaffected by this guard existing; a test that wants to see the
 * blocking path sets `behavior = 'blocked'`, the unreachable path with `'server-error'`, or the timeout
 * path (GATEWAY_SECURITY_FAIL_OPEN) with `'hang'` — all already-generic `FakeBehavior` values shared with
 * the provider fakes, so nothing new was added to that type.
 */
const respond: Responder = (_request, behavior) => {
  switch (behavior) {
    case 'hang':
      return null;
    case 'server-error':
      return { status: 500, body: { error: 'internal error' } };
    case 'blocked':
      return {
        status: 200,
        body: {
          blocked: true,
          safe: false,
          issues: [{ type: 'prompt_injection', preview: 'ignore previous instructions' }],
        },
      };
    default:
      return { status: 200, body: { blocked: false, safe: true, issues: [] } };
  }
};

export const startFakeSecurity = (): Promise<FakeProvider> =>
  startFakeProvider(respond, { path: /^\/security\/check$/ });
