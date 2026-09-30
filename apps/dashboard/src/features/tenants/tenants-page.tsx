'use client';

import * as React from 'react';
import { Building2, Plus } from 'lucide-react';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { AccessDenied, Can } from '@/features/auth/can';
import type { Tenant } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { TENANTS_PAGE_SIZE, useTenantMutations, useTenants } from './hooks';
import { TenantFormDialog } from './tenant-form-dialog';
import { TenantsTable } from './tenants-table';

type Dialog =
  | { type: 'form'; tenant?: Tenant }
  | { type: 'suspend'; tenant: Tenant }
  | { type: 'delete'; tenant: Tenant }
  | null;

function TenantsContent() {
  const [offset, setOffset] = React.useState(0);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const tenants = useTenants(offset);
  const { update, remove } = useTenantMutations();
  const close = () => {
    setDialog(null);
    update.reset();
    remove.reset();
  };

  const confirmSuspend = async (tenant: Tenant) => {
    try {
      await update.mutateAsync({
        id: tenant.id,
        input: { status: tenant.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' },
      });
      close();
    } catch {
      // The error is shown in the dialog from the mutation state.
    }
  };
  const confirmDelete = async (tenant: Tenant) => {
    try {
      await remove.mutateAsync(tenant.id);
      close();
    } catch {
      // The error is shown in the dialog from the mutation state.
    }
  };

  return (
    <>
      <PageHeader
        title="Tenant Management"
        description="Companies using the platform."
        actions={
          <Button onClick={() => setDialog({ type: 'form' })}>
            <Plus /> Create tenant
          </Button>
        }
      />

      <Card>
        <QueryBoundary
          query={tenants}
          loading={<TableSkeleton columns={5} />}
          isEmpty={(page) => page.total === 0}
          empty={
            <EmptyState
              icon={Building2}
              title="No tenants yet"
              description="Create the first tenant to get started."
              action={<Button onClick={() => setDialog({ type: 'form' })}>Create tenant</Button>}
            />
          }
        >
          {(page) => (
            <>
              <TenantsTable
                tenants={page.data}
                onEdit={(tenant) => setDialog({ type: 'form', tenant })}
                onToggleSuspend={(tenant) => setDialog({ type: 'suspend', tenant })}
                onDelete={(tenant) => setDialog({ type: 'delete', tenant })}
              />
              <Pagination
                offset={offset}
                limit={TENANTS_PAGE_SIZE}
                total={page.total}
                onChange={setOffset}
              />
            </>
          )}
        </QueryBoundary>
      </Card>

      {dialog?.type === 'form' && (
        <TenantFormDialog {...(dialog.tenant ? { tenant: dialog.tenant } : {})} onClose={close} />
      )}
      {dialog?.type === 'suspend' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={dialog.tenant.status === 'SUSPENDED' ? 'Reactivate tenant' : 'Suspend tenant'}
          description={
            dialog.tenant.status === 'SUSPENDED'
              ? `Users of ${dialog.tenant.companyName} will be able to sign in again.`
              : `Every user of ${dialog.tenant.companyName} will be signed out and blocked until it is reactivated.`
          }
          confirmLabel={dialog.tenant.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
          loading={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onConfirm={() => void confirmSuspend(dialog.tenant)}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title="Delete tenant"
          description={`${dialog.tenant.companyName} will be deactivated and all of its sessions ended. Its usage and audit history is kept.`}
          confirmLabel="Delete tenant"
          destructive
          loading={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onConfirm={() => void confirmDelete(dialog.tenant)}
        />
      )}
    </>
  );
}

/** The permission check wraps the content so no request is made for users who cannot see it. */
export function TenantsPage() {
  return (
    <Can permission={Permission.TENANT_MANAGE} fallback={<AccessDenied />}>
      <TenantsContent />
    </Can>
  );
}
