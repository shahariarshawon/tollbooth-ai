import type { Metadata } from 'next';
import { TenantsPage } from '@/features/tenants/tenants-page';

export const metadata: Metadata = { title: 'Tenant Management' };

export default function Page() {
  return <TenantsPage />;
}
