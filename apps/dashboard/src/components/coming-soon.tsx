'use client';

import { Hammer } from 'lucide-react';
import type { Permission } from '@tollbooth/shared';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';
import { AccessDenied, Can } from '@/features/auth/can';

interface ComingSoonProps {
  title: string;
  description: string;
  /** Same permission the sidebar uses for this section. */
  permission: Permission;
}

/** Placeholder for navigation sections whose features arrive in a later phase. */
export function ComingSoon({ title, description, permission }: ComingSoonProps) {
  return (
    <Can permission={permission} fallback={<AccessDenied />}>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          icon={Hammer}
          title="Coming soon"
          description="This section will be available once its backend services are in place."
        />
      </Card>
    </Can>
  );
}
