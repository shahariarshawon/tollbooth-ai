import type { Metadata } from 'next';
import { AuditLogsPage } from '@/features/audit-logs/audit-logs-page';

export const metadata: Metadata = { title: 'Audit Logs' };

export default function Page() {
  return <AuditLogsPage />;
}
