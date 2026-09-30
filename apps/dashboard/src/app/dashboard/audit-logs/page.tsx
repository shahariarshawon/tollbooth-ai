import type { Metadata } from 'next';
import { Permission } from '@tollbooth/shared';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Audit Logs' };

export default function Page() {
  return (
    <ComingSoon
      title="Audit Logs"
      description="A record of security-relevant actions in your tenant."
      permission={Permission.MANAGE_SETTINGS}
    />
  );
}
