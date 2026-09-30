import { Pencil, Play, Power, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { RowActions } from '@/components/ui/row-actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { User } from '@/types/api';
import { formatDate, fullName, humanize } from '@/utils/format';

interface UsersTableProps {
  users: User[];
  currentUserId: string;
  /** Capabilities of the signed-in user; actions they lack are not rendered at all. */
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (user: User) => void;
  onChangeRole: (user: User) => void;
  onToggleStatus: (user: User) => void;
  onDelete: (user: User) => void;
}

export function UsersTable({
  users,
  currentUserId,
  canUpdate,
  canDelete,
  onEdit,
  onChangeRole,
  onToggleStatus,
  onDelete,
}: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          const disabled = user.status === 'DISABLED';
          return (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                {fullName(user)}
                {isSelf && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>
                <Badge variant="outline">{humanize(user.role)}</Badge>
              </TableCell>
              <TableCell>
                <StatusBadge status={user.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
              <TableCell>
                <RowActions
                  label={`Actions for ${fullName(user)}`}
                  actions={[
                    {
                      label: 'Edit',
                      icon: <Pencil />,
                      onSelect: () => onEdit(user),
                      hidden: !canUpdate,
                    },
                    {
                      label: 'Change role',
                      icon: <ShieldCheck />,
                      onSelect: () => onChangeRole(user),
                      hidden: !canUpdate,
                      // The control plane forbids changing your own role or status.
                      disabled: isSelf,
                    },
                    {
                      label: disabled ? 'Activate' : 'Deactivate',
                      icon: disabled ? <Play /> : <Power />,
                      onSelect: () => onToggleStatus(user),
                      hidden: !canUpdate,
                      disabled: isSelf,
                    },
                    {
                      label: 'Delete',
                      icon: <Trash2 />,
                      onSelect: () => onDelete(user),
                      destructive: true,
                      separated: true,
                      hidden: !canDelete,
                      disabled: isSelf,
                    },
                  ]}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
