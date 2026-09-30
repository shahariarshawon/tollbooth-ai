import type { Metadata } from 'next';
import { Permission } from '@tollbooth/shared';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return (
    <ComingSoon
      title="Settings"
      description="Organization-wide configuration."
      permission={Permission.MANAGE_SETTINGS}
    />
  );
}
