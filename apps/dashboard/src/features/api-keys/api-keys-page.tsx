'use client';

import * as React from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { AccessDenied, Can } from '@/features/auth/can';
import { usePermission } from '@/hooks/use-permission';
import type { ApiKey, IssuedApiKey } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { ApiKeysTable } from './api-keys-table';
import { CreateKeyDialog } from './create-key-dialog';
import { useApiKeyMutations, useApiKeys } from './hooks';
import { SecretRevealDialog } from './secret-reveal-dialog';

type Dialog =
  { type: 'create' } | { type: 'rotate'; key: ApiKey } | { type: 'revoke'; key: ApiKey } | null;

function ApiKeysContent() {
  const canCreate = usePermission(Permission.API_KEY_CREATE);
  const canDelete = usePermission(Permission.API_KEY_DELETE);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  // The one-time secret. It lives only here, and only until the user closes the reveal dialog.
  const [issued, setIssued] = React.useState<IssuedApiKey | null>(null);
  const keys = useApiKeys();
  const { rotate, revoke } = useApiKeyMutations();

  const close = () => {
    setDialog(null);
    rotate.reset();
    revoke.reset();
  };

  const confirmRotate = async (key: ApiKey) => {
    try {
      const result = await rotate.mutateAsync(key.id);
      rotate.reset();
      setDialog(null);
      setIssued(result);
    } catch {
      // Shown in the dialog from the mutation state.
    }
  };

  return (
    <>
      <PageHeader
        title="API Keys"
        description="Credentials your applications use to call the gateway."
        actions={
          canCreate && (
            <Button onClick={() => setDialog({ type: 'create' })}>
              <Plus /> Create key
            </Button>
          )
        }
      />
      <p className="text-sm text-muted-foreground">
        Preview: keys are simulated in your browser session until the API keys endpoint ships.
      </p>

      <Card>
        <QueryBoundary
          query={keys}
          loading={<TableSkeleton columns={7} />}
          isEmpty={(list) => list.length === 0}
          empty={
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              description="Create a key so an application can call the gateway."
              action={
                canCreate && (
                  <Button onClick={() => setDialog({ type: 'create' })}>Create key</Button>
                )
              }
            />
          }
        >
          {(list) => (
            <ApiKeysTable
              keys={list}
              {...(canCreate
                ? { onRotate: (key: ApiKey) => setDialog({ type: 'rotate', key }) }
                : {})}
              {...(canDelete
                ? { onRevoke: (key: ApiKey) => setDialog({ type: 'revoke', key }) }
                : {})}
            />
          )}
        </QueryBoundary>
      </Card>

      {dialog?.type === 'create' && (
        <CreateKeyDialog
          onClose={close}
          onCreated={(result) => {
            setDialog(null);
            setIssued(result);
          }}
        />
      )}
      {dialog?.type === 'rotate' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title="Rotate key"
          description={`A new key replaces "${dialog.key.name}". The old key stops working immediately, so update your application first or right after.`}
          confirmLabel="Rotate key"
          loading={rotate.isPending}
          error={rotate.isError ? errorMessage(rotate.error) : null}
          onConfirm={() => void confirmRotate(dialog.key)}
        />
      )}
      {dialog?.type === 'revoke' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title="Revoke key"
          description={`"${dialog.key.name}" stops working immediately and cannot be restored.`}
          confirmLabel="Revoke key"
          destructive
          loading={revoke.isPending}
          error={revoke.isError ? errorMessage(revoke.error) : null}
          onConfirm={() => void revoke.mutateAsync(dialog.key.id).then(close, () => undefined)}
        />
      )}
      {issued && <SecretRevealDialog issued={issued} onClose={() => setIssued(null)} />}
    </>
  );
}

export function ApiKeysPage() {
  return (
    <Can permission={Permission.API_KEY_CREATE} fallback={<AccessDenied />}>
      <ApiKeysContent />
    </Can>
  );
}
