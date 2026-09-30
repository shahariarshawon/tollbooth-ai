'use client';

import * as React from 'react';
import { Building2, Plus, Users } from 'lucide-react';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { useAuth } from '@/features/auth/auth-provider';
import { AccessDenied, Can } from '@/features/auth/can';
import { TenantScopePicker } from '@/features/navigation/tenant-scope-picker';
import { usePermission } from '@/hooks/use-permission';
import type { User } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { fullName } from '@/utils/format';
import { ChangeRoleDialog } from './change-role-dialog';
import { USERS_PAGE_SIZE, useNeedsTenantScope, useUserMutations, useUsers } from './hooks';
import { UserFormDialog } from './user-form-dialog';
import { UsersTable } from './users-table';

type Dialog =
  | { type: 'form'; user?: User }
  | { type: 'role'; user: User }
  | { type: 'status'; user: User }
  | { type: 'delete'; user: User }
  | null;

function UsersContent() {
  const { user: me } = useAuth();
  const canCreate = usePermission(Permission.USER_CREATE);
  const canUpdate = usePermission(Permission.USER_UPDATE);
  const canDelete = usePermission(Permission.USER_DELETE);
  const needsScope = useNeedsTenantScope();
  const [offset, setOffset] = React.useState(0);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const users = useUsers(offset);
  const { update, remove } = useUserMutations();

  const close = () => {
    setDialog(null);
    update.reset();
    remove.reset();
  };

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      close();
    } catch {
      // Shown in the dialog from the mutation state.
    }
  };

  if (needsScope) {
    return (
      <>
        <PageHeader title="Users" description="People with access to a tenant." />
        <Card>
          <EmptyState
            icon={Building2}
            title="Choose a tenant"
            description="Super admins work inside one tenant at a time. Pick one to manage its users."
            action={<TenantScopePicker className="w-56" />}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="People with access to this tenant."
        actions={
          canCreate && (
            <Button onClick={() => setDialog({ type: 'form' })}>
              <Plus /> Create user
            </Button>
          )
        }
      />

      <Card>
        <QueryBoundary
          query={users}
          loading={<TableSkeleton columns={6} />}
          isEmpty={(page) => page.total === 0}
          empty={
            <EmptyState
              icon={Users}
              title="No users yet"
              description="Invite the first member of this tenant."
              action={
                canCreate && (
                  <Button onClick={() => setDialog({ type: 'form' })}>Create user</Button>
                )
              }
            />
          }
        >
          {(page) => (
            <>
              <UsersTable
                users={page.data}
                currentUserId={me?.id ?? ''}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onEdit={(user) => setDialog({ type: 'form', user })}
                onChangeRole={(user) => setDialog({ type: 'role', user })}
                onToggleStatus={(user) => setDialog({ type: 'status', user })}
                onDelete={(user) => setDialog({ type: 'delete', user })}
              />
              <Pagination
                offset={offset}
                limit={USERS_PAGE_SIZE}
                total={page.total}
                onChange={setOffset}
              />
            </>
          )}
        </QueryBoundary>
      </Card>

      {dialog?.type === 'form' && (
        <UserFormDialog {...(dialog.user ? { user: dialog.user } : {})} onClose={close} />
      )}
      {dialog?.type === 'role' && <ChangeRoleDialog user={dialog.user} onClose={close} />}
      {dialog?.type === 'status' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={dialog.user.status === 'DISABLED' ? 'Activate user' : 'Deactivate user'}
          description={
            dialog.user.status === 'DISABLED'
              ? `${fullName(dialog.user)} will be able to sign in again.`
              : `${fullName(dialog.user)} will be signed out and unable to sign in until reactivated.`
          }
          confirmLabel={dialog.user.status === 'DISABLED' ? 'Activate' : 'Deactivate'}
          loading={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onConfirm={() =>
            void run(() =>
              update.mutateAsync({
                id: dialog.user.id,
                input: { status: dialog.user.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' },
              }),
            )
          }
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title="Delete user"
          description={`${fullName(dialog.user)} (${dialog.user.email}) will be permanently removed.`}
          confirmLabel="Delete user"
          destructive
          loading={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onConfirm={() => void run(() => remove.mutateAsync(dialog.user.id))}
        />
      )}
    </>
  );
}

/** The permission check wraps the content so no request is made for users who cannot see it. */
export function UsersPage() {
  return (
    <Can permission={Permission.USER_READ} fallback={<AccessDenied />}>
      <UsersContent />
    </Can>
  );
}
