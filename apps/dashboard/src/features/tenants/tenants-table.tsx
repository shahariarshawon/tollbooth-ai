import { Pause, Pencil, Play, Trash2 } from 'lucide-react';
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
import type { Tenant } from '@/types/api';
import { formatDate, humanize } from '@/utils/format';

interface TenantsTableProps {
  tenants: Tenant[];
  onEdit: (tenant: Tenant) => void;
  onToggleSuspend: (tenant: Tenant) => void;
  onDelete: (tenant: Tenant) => void;
}

export function TenantsTable({ tenants, onEdit, onToggleSuspend, onDelete }: TenantsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Company</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tenants.map((tenant) => {
          const deleted = tenant.status === 'DELETED';
          const suspended = tenant.status === 'SUSPENDED';
          return (
            <TableRow key={tenant.id}>
              <TableCell>
                <div className="font-medium">{tenant.companyName}</div>
                <div className="text-xs text-muted-foreground">{tenant.slug}</div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{humanize(tenant.plan)}</Badge>
              </TableCell>
              <TableCell>
                <StatusBadge status={tenant.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(tenant.createdAt)}
              </TableCell>
              <TableCell>
                <RowActions
                  label={`Actions for ${tenant.companyName}`}
                  actions={[
                    {
                      label: 'Edit',
                      icon: <Pencil />,
                      onSelect: () => onEdit(tenant),
                      hidden: deleted,
                    },
                    {
                      label: suspended ? 'Reactivate' : 'Suspend',
                      icon: suspended ? <Play /> : <Pause />,
                      onSelect: () => onToggleSuspend(tenant),
                      hidden: deleted,
                    },
                    {
                      label: 'Delete',
                      icon: <Trash2 />,
                      onSelect: () => onDelete(tenant),
                      destructive: true,
                      separated: true,
                      hidden: deleted,
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
