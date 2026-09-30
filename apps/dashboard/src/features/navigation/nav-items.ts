import {
  BarChart3,
  Building2,
  CreditCard,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import { Permission, roleHasPermission } from '@tollbooth/shared';
import type { UserRole } from '@tollbooth/shared';
import type { NavItem } from '@/components/ui/sidebar';

interface AppNavItem extends NavItem {
  /** Omitted means every signed-in user sees the item. */
  permission?: Permission;
}

export const NAV_ITEMS: AppNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Tenant Management',
    href: '/dashboard/tenants',
    icon: Building2,
    permission: Permission.TENANT_MANAGE,
  },
  { label: 'Users', href: '/dashboard/users', icon: Users, permission: Permission.USER_READ },
  {
    label: 'Projects',
    href: '/dashboard/projects',
    icon: FolderKanban,
    permission: Permission.PROJECT_READ,
  },
  {
    label: 'API Keys',
    href: '/dashboard/api-keys',
    icon: KeyRound,
    permission: Permission.API_KEY_CREATE,
  },
  {
    label: 'Usage Analytics',
    href: '/dashboard/analytics',
    icon: BarChart3,
    permission: Permission.VIEW_ANALYTICS,
  },
  {
    label: 'Billing',
    href: '/dashboard/billing',
    icon: CreditCard,
    permission: Permission.VIEW_BILLING,
  },
  {
    label: 'Audit Logs',
    href: '/dashboard/audit-logs',
    icon: ScrollText,
    permission: Permission.MANAGE_SETTINGS,
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    permission: Permission.MANAGE_SETTINGS,
  },
];

/** The navigation a role is allowed to see, in display order. */
export function navItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.permission || roleHasPermission(role, item.permission),
  ).map(({ label, href, icon }) => ({ label, href, icon }));
}
