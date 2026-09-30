import { Ban, RefreshCw } from 'lucide-react';
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
import type { ApiKey } from '@/types/api';
import { formatDate, formatNumber } from '@/utils/format';

interface ApiKeysTableProps {
  keys: ApiKey[];
  /** Omit a handler to hide its action, for users who lack the permission. */
  onRotate?: (key: ApiKey) => void;
  onRevoke?: (key: ApiKey) => void;
}

/**
 * Lists keys by name and prefix only. The full key is never part of this data: it exists in the
 * browser only in the one-time dialog shown right after creation or rotation.
 */
export function ApiKeysTable({ keys, onRotate, onRevoke }: ApiKeysTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Name</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Permissions</TableHead>
          <TableHead>Rate limit</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => {
          const revoked = key.status === 'REVOKED';
          return (
            <TableRow key={key.id}>
              <TableCell>
                <div className="font-medium">{key.name}</div>
                <code className="text-xs text-muted-foreground">{key.keyPrefix}...</code>
              </TableCell>
              <TableCell>{key.projectName}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {key.permissions.map((permission) => (
                    <Badge key={permission} variant="outline">
                      {permission}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {key.rateLimit === null ? 'Plan default' : `${formatNumber(key.rateLimit)} / min`}
              </TableCell>
              <TableCell>
                <StatusBadge status={key.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(key.createdAt)}</TableCell>
              <TableCell>
                <RowActions
                  label={`Actions for ${key.name}`}
                  actions={[
                    {
                      label: 'Rotate key',
                      icon: <RefreshCw />,
                      onSelect: () => onRotate?.(key),
                      hidden: !onRotate || revoked,
                    },
                    {
                      label: 'Revoke key',
                      icon: <Ban />,
                      onSelect: () => onRevoke?.(key),
                      destructive: true,
                      separated: true,
                      hidden: !onRevoke || revoked,
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
