'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import type { Permission } from '@tollbooth/shared';
import { EmptyState } from '@/components/ui/states';
import { usePermission } from '@/hooks/use-permission';

interface CanProps {
  permission: Permission;
  /** Rendered when the user lacks the permission. Nothing by default. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/** Renders its children only for users holding `permission`. */
export function Can({ permission, fallback = null, children }: CanProps) {
  return usePermission(permission) ? <>{children}</> : <>{fallback}</>;
}

/** Full-page fallback for a route the user may not open. */
export function AccessDenied() {
  return (
    <EmptyState
      icon={Lock}
      title="You do not have access to this page"
      description="Ask a tenant administrator if you need it."
    />
  );
}
