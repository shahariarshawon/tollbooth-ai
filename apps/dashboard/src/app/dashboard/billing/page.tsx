import type { Metadata } from 'next';
import { BillingPage } from '@/features/billing/billing-page';

export const metadata: Metadata = { title: 'Billing & Cost Control' };

export default function Page() {
  return <BillingPage />;
}
