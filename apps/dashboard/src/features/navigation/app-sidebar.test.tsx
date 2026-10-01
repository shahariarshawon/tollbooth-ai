import { render, screen } from '@testing-library/react';
import type { UserRole } from '@tollbooth/shared';
import { AppSidebar } from './app-sidebar';

let role: UserRole = 'DEVELOPER';
let pathname = '/dashboard';

jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', role } }),
}));

const ALL = [
  'Dashboard',
  'Tenant Management',
  'Users',
  'Teams & Limits',
  'Projects',
  'API Keys',
  'Usage Analytics',
  'Billing',
  'Alerts',
  'Audit Logs',
  'Settings',
];

function visibleItems(): string[] {
  return screen.getAllByRole('link').map((link) => link.textContent ?? '');
}

describe('AppSidebar permissions', () => {
  beforeEach(() => {
    pathname = '/dashboard';
  });

  it.each<[UserRole, string[]]>([
    ['SUPER_ADMIN', ALL],
    [
      'TENANT_ADMIN',
      [
        'Dashboard',
        'Users',
        'Teams & Limits',
        'Projects',
        'API Keys',
        'Usage Analytics',
        'Billing',
        'Alerts',
        'Audit Logs',
        'Settings',
      ],
    ],
    ['DEVELOPER', ['Dashboard', 'Projects', 'API Keys', 'Usage Analytics', 'Alerts']],
    ['FINANCE', ['Dashboard', 'Projects', 'Usage Analytics', 'Billing', 'Alerts']],
  ])('shows the right sections to %s', (userRole, expected) => {
    role = userRole;
    render(<AppSidebar />);
    expect(visibleItems()).toEqual(expected);
  });

  it('only shows tenant management to super admins', () => {
    for (const userRole of ['TENANT_ADMIN', 'DEVELOPER', 'FINANCE'] as const) {
      role = userRole;
      const { unmount } = render(<AppSidebar />);
      expect(screen.queryByText('Tenant Management')).not.toBeInTheDocument();
      unmount();
    }
    role = 'SUPER_ADMIN';
    render(<AppSidebar />);
    expect(screen.getByText('Tenant Management')).toBeInTheDocument();
  });

  it('links each item to its route', () => {
    role = 'SUPER_ADMIN';
    render(<AppSidebar />);
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/dashboard/users');
    expect(screen.getByRole('link', { name: 'API Keys' })).toHaveAttribute(
      'href',
      '/dashboard/api-keys',
    );
  });

  it('marks only the current section as active', () => {
    role = 'SUPER_ADMIN';
    pathname = '/dashboard/users';
    render(<AppSidebar />);
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });
});
