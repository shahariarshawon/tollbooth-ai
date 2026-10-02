'use client';

import * as React from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import type { TeamMemberRole } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useTeam, useTeamMutations, useTenantUsers } from './hooks';

interface TeamMembersDialogProps {
  teamId: string;
  onClose: () => void;
}

export function TeamMembersDialog({ teamId, onClose }: TeamMembersDialogProps) {
  const { data: team, isLoading } = useTeam(teamId);
  const { data: usersPage } = useTenantUsers();
  const { addMember, removeMember } = useTeamMutations();
  const { toast } = useToast();

  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [selectedRole, setSelectedRole] = React.useState<TeamMemberRole>('MEMBER');

  const existingMemberUserIds = React.useMemo(() => {
    return new Set(team?.members.map((m) => m.userId) ?? []);
  }, [team]);

  const availableUsers = React.useMemo(() => {
    return (usersPage?.data ?? []).filter((u) => !existingMemberUserIds.has(u.id));
  }, [usersPage, existingMemberUserIds]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    try {
      await addMember.mutateAsync({
        teamId,
        input: { userId: selectedUserId, role: selectedRole },
      });
      toast.success('Member added to team');
      setSelectedUserId('');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    try {
      await removeMember.mutateAsync({ teamId, userId });
      toast.success(`Removed ${name} from team`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Team Members — {team?.name ?? 'Loading...'}</DialogTitle>
          <DialogDescription>
            Manage users assigned to this team and their team roles.
          </DialogDescription>
        </DialogHeader>

        {/* Add Member Form */}
        <form onSubmit={handleAddMember} className="flex items-end gap-2 border-b pb-4 pt-2">
          <div className="flex-1">
            <Field label="Add User" htmlFor="userSelect">
              <select
                id="userSelect"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              >
                <option value="">Select a user...</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.email})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="w-28">
            <Field label="Role" htmlFor="roleSelect">
              <select
                id="roleSelect"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as TeamMemberRole)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="MEMBER">Member</option>
                <option value="LEAD">Lead</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </Field>
          </div>

          <Button
            type="submit"
            size="sm"
            loading={addMember.isPending}
            disabled={!selectedUserId}
          >
            <UserPlus className="size-3.5 mr-1" /> Add
          </Button>
        </form>

        {/* Members List */}
        <div className="space-y-3 py-2 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading members...</div>
          ) : team?.members.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No members assigned to this team yet.
            </div>
          ) : (
            team?.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 hover:bg-accent/30"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">
                      {member.user.firstName?.[0] ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h5 className="font-semibold text-xs text-foreground">
                      {member.user.firstName} {member.user.lastName}
                    </h5>
                    <p className="text-[11px] text-muted-foreground">{member.user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={member.role === 'LEAD' ? 'default' : 'outline'} className="text-[10px]">
                    {member.role}
                  </Badge>
                  <button
                    onClick={() =>
                      handleRemoveMember(
                        member.userId,
                        `${member.user.firstName} ${member.user.lastName}`,
                      )
                    }
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                    title="Remove from team"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
