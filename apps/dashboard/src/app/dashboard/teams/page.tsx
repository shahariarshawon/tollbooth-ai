import type { Metadata } from 'next';
import { TeamsPage } from '@/features/teams/teams-page';

export const metadata: Metadata = { title: 'Teams & Limits' };

export default function Page() {
  return <TeamsPage />;
}
