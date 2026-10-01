import type { Metadata } from 'next';
import { AlertsPage } from '@/features/alerts/alerts-page';

export const metadata: Metadata = { title: 'Alerts' };

export default function Page() {
  return <AlertsPage />;
}
