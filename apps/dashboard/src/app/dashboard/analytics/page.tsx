import type { Metadata } from 'next';
import { Permission } from '@tollbooth/shared';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Usage Analytics' };

export default function Page() {
  return (
    <ComingSoon
      title="Usage Analytics"
      description="Requests, tokens and latency by project, model and provider."
      permission={Permission.VIEW_ANALYTICS}
    />
  );
}
