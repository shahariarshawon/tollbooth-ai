import type { Metadata } from 'next';
import { Permission } from '@tollbooth/shared';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Billing' };

export default function Page() {
  return (
    <ComingSoon
      title="Billing"
      description="Spend, budgets and invoices."
      permission={Permission.VIEW_BILLING}
    />
  );
}
