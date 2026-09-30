'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/features/auth/auth-provider';
import { navItemsForRole } from './nav-items';

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const items = user ? navItemsForRole(user.role) : [];
  return <Sidebar items={items} pathname={pathname} {...(onNavigate ? { onNavigate } : {})} />;
}
