import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { DemoPolicyGuard } from './demo-policy.guard';

function contextFor(
  request: { method: string; tenant: { isDemo: boolean } | null },
  isPublic = false,
) {
  const handler = () => undefined;
  if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('DemoPolicyGuard', () => {
  const guard = new DemoPolicyGuard(new Reflector());

  it.each(['GET', 'HEAD', 'OPTIONS'])('lets a demo tenant %s', (method) => {
    expect(guard.canActivate(contextFor({ method, tenant: { isDemo: true } }))).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses a demo tenant %s', (method) => {
    expect(() => guard.canActivate(contextFor({ method, tenant: { isDemo: true } }))).toThrow(
      ForbiddenException,
    );
  });

  it.each(['POST', 'PATCH', 'DELETE'])(
    'never touches a tenant that is not a demo: %s',
    (method) => {
      expect(guard.canActivate(contextFor({ method, tenant: { isDemo: false } }))).toBe(true);
    },
  );

  it('leaves requests without a tenant alone (a SUPER_ADMIN acting platform-wide)', () => {
    expect(guard.canActivate(contextFor({ method: 'POST', tenant: null }))).toBe(true);
  });

  it('does not apply to public routes, which have no tenant context at all', () => {
    expect(guard.canActivate(contextFor({ method: 'POST', tenant: { isDemo: true } }, true))).toBe(
      true,
    );
  });
});
