'use client';

import * as React from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { AccessDenied, Can } from '@/features/auth/can';
import { usePermission } from '@/hooks/use-permission';
import type { Project } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useProjectMutations, useProjects } from './hooks';
import { ProjectFormDialog } from './project-form-dialog';
import { ProjectsTable } from './projects-table';

type Dialog = { type: 'form'; project?: Project } | { type: 'delete'; project: Project } | null;

function ProjectsContent() {
  const canManage = usePermission(Permission.PROJECT_MANAGE);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const projects = useProjects();
  const { update, remove } = useProjectMutations();

  const close = () => {
    setDialog(null);
    remove.reset();
  };

  return (
    <>
      <PageHeader
        title="Projects"
        description="Applications that send AI requests through Tollbooth."
        actions={
          canManage && (
            <Button onClick={() => setDialog({ type: 'form' })}>
              <Plus /> Create project
            </Button>
          )
        }
      />
      <p className="text-sm text-muted-foreground">
        Preview: project data is stored in your browser session until the projects API ships.
      </p>

      <Card>
        <QueryBoundary
          query={projects}
          loading={<TableSkeleton columns={5} />}
          isEmpty={(list) => list.length === 0}
          empty={
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create a project, then issue API keys for it."
              action={
                canManage && (
                  <Button onClick={() => setDialog({ type: 'form' })}>Create project</Button>
                )
              }
            />
          }
        >
          {(list) => (
            <ProjectsTable
              projects={list}
              canManage={canManage}
              onEdit={(project) => setDialog({ type: 'form', project })}
              onToggleArchive={(project) =>
                void update.mutateAsync({
                  id: project.id,
                  input: { status: project.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' },
                })
              }
              onDelete={(project) => setDialog({ type: 'delete', project })}
            />
          )}
        </QueryBoundary>
      </Card>

      {dialog?.type === 'form' && (
        <ProjectFormDialog
          {...(dialog.project ? { project: dialog.project } : {})}
          onClose={close}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title="Delete project"
          description={`${dialog.project.name} will be permanently deleted.`}
          confirmLabel="Delete project"
          destructive
          loading={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onConfirm={() => void remove.mutateAsync(dialog.project.id).then(close, () => undefined)}
        />
      )}
    </>
  );
}

export function ProjectsPage() {
  return (
    <Can permission={Permission.PROJECT_READ} fallback={<AccessDenied />}>
      <ProjectsContent />
    </Can>
  );
}
