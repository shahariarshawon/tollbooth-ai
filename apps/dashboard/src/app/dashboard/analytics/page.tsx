import type { Metadata } from 'next';
import { AnalyticsPage } from '@/features/analytics/analytics-page';

export const metadata: Metadata = { title: 'Usage Analytics' };

export default function Page() {
  return <AnalyticsPage />;
}
