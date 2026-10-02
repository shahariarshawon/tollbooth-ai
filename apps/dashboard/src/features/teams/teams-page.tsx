'use client';

import * as React from 'react';
import { Users2, Plus } from 'lucide-react';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { AccessDenied, Can } from '@/features/auth/can';
import { usePermission } from '@/hooks/use-permission';
import type { Team } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useTeamMutations, useTeams } from './hooks';
import { TeamFormDialog } from './team-form-dialog';
import { TeamMembersDialog } from './team-members-dialog';
import { TeamsTable } from './teams-table';

type DialogState =
  | { type: 'form'; team?: Team }
  | { type: 'members'; teamId: string }
  | { type: 'delete'; team: Team }
  | null;

function TeamsContent() {
  const canManage = usePermission(Permission.TEAM_MANAGE);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const teamsQuery = useTeams();
  const { remove } = useTeamMutations();
  const { toast } = useToast();

  const closeDialog = () => {
    setDialog(null);
    remove.reset();
  };

  const handleDelete = async (team: Team) => {
    try {
      await remove.mutateAsync(team.id);
      toast.success(`Team "${team.name}" deleted successfully.`);
      closeDialog();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Teams & Limit Control"
        description="Organize workspaces into teams with granular request & token limits, monthly budgets, and model permissions."
        actions={
          canManage && (
            <Button onClick={() => setDialog({ type: 'form' })} className="gap-2">
              <Plus className="h-4 w-4" /> Create Team
            </Button>
          )
        }
      />

      <Card className="p-0 overflow-hidden border-border/70">
        <QueryBoundary
          query={teamsQuery}
          loading={<TableSkeleton columns={7} rows={4} />}
          isEmpty={(list) => !list || list.length === 0}
          empty={
            <EmptyState
              icon={Users2}
              title="No teams configured"
              description="Create teams like Engineering, Marketing, or Research to enforce budgets and model access."
              action={
                canManage && (
                  <Button onClick={() => setDialog({ type: 'form' })} className="mt-4 gap-2">
                    <Plus className="h-4 w-4" /> Create First Team
                  </Button>
                )
              }
            />
          }
        >
          {(teams) => (
            <TeamsTable
              teams={teams}
              onEdit={(team) => setDialog({ type: 'form', team })}
              onManageMembers={(team) => setDialog({ type: 'members', teamId: team.id })}
              onDelete={(team) => setDialog({ type: 'delete', team })}
            />
          )}
        </QueryBoundary>
      </Card>

      {/* Create / Edit Form Modal */}
      {dialog?.type === 'form' && (
        <TeamFormDialog team={dialog.team} onClose={closeDialog} />
      )}

      {/* Member Management Modal */}
      {dialog?.type === 'members' && (
        <TeamMembersDialog teamId={dialog.teamId} onClose={closeDialog} />
      )}

      {/* Delete Confirmation */}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => !open && closeDialog()}
          title={`Delete ${dialog.team.name}?`}
          description="Are you sure you want to delete this team? Projects and API keys assigned to this team will have their team association cleared, but will not be deleted."
          confirmLabel={remove.isPending ? 'Deleting...' : 'Delete Team'}
          destructive
          loading={remove.isPending}
          onConfirm={() => handleDelete(dialog.team)}
        />
      )}
    </>
  );
}

export function TeamsPage() {
  return (
    <Can
      permission={Permission.TEAM_READ}
      fallback={<AccessDenied />}
    >
      <TeamsContent />
    </Can>
  );
}
