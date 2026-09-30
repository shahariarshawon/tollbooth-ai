import { render, renderHook, screen } from '@testing-library/react';
import { Permission } from '@tollbooth/shared';
import type { UserRole } from '@tollbooth/shared';
import { usePermission } from '@/hooks/use-permission';
import { AccessDenied, Can } from './can';

let user: { role: UserRole } | null = { role: 'DEVELOPER' };

jest.mock('./auth-provider', () => ({ useAuth: () => ({ user }) }));

describe('usePermission', () => {
  it.each<[UserRole, Permission, boolean]>([
    ['TENANT_ADMIN', Permission.USER_CREATE, true],
    ['DEVELOPER', Permission.USER_CREATE, false],
    ['FINANCE', Permission.VIEW_BILLING, true],
    ['DEVELOPER', Permission.VIEW_BILLING, false],
    ['SUPER_ADMIN', Permission.TENANT_MANAGE, true],
    ['TENANT_ADMIN', Permission.TENANT_MANAGE, false],
  ])('%s with %s -> %s', (role, permission, expected) => {
    user = { role };
    expect(renderHook(() => usePermission(permission)).result.current).toBe(expected);
  });

  it('denies everything when signed out', () => {
    user = null;
    expect(renderHook(() => usePermission(Permission.VIEW_ANALYTICS)).result.current).toBe(false);
  });
});

describe('Can', () => {
  it('shows a Create user button only to roles holding USER_CREATE', () => {
    const ui = (
      <Can permission={Permission.USER_CREATE}>
        <button>Create user</button>
      </Can>
    );

    user = { role: 'TENANT_ADMIN' };
    const { unmount } = render(ui);
    expect(screen.getByRole('button', { name: 'Create user' })).toBeInTheDocument();
    unmount();

    user = { role: 'FINANCE' };
    render(ui);
    expect(screen.queryByRole('button', { name: 'Create user' })).not.toBeInTheDocument();
  });

  it('renders the fallback for a forbidden page', () => {
    user = { role: 'DEVELOPER' };
    render(
      <Can permission={Permission.TENANT_MANAGE} fallback={<AccessDenied />}>
        <p>secret page</p>
      </Can>,
    );
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
    expect(screen.getByText('You do not have access to this page')).toBeInTheDocument();
  });
});
