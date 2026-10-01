'use client';

import * as React from 'react';
import { Ban, RefreshCw, Users, Clock, Coins, Activity } from 'lucide-react';
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
          <TableHead>Team</TableHead>
          <TableHead>Permissions</TableHead>
          <TableHead>Rate limit</TableHead>
          <TableHead>Usage & Cost</TableHead>
          <TableHead>Last Used</TableHead>
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
          const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date();
          const requests = key.totalRequests ?? 0;
          const tokens = key.totalTokens ?? 0;
          const cost = key.totalCost ?? 0;

          return (
            <TableRow key={key.id}>
              {/* Name & Key Prefix */}
              <TableCell>
                <div className="font-medium">{key.name}</div>
                <code className="text-xs text-muted-foreground">{key.keyPrefix}...</code>
                {key.expiresAt && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Exp: {new Date(key.expiresAt).toLocaleDateString()}</span>
                  </div>
                )}
              </TableCell>

              {/* Project */}
              <TableCell>{key.projectName}</TableCell>

              {/* Team */}
              <TableCell>
                {key.teamName ? (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    {key.teamName}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground italic">None</span>
                )}
              </TableCell>

              {/* Permissions */}
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {key.permissions.map((permission) => (
                    <Badge key={permission} variant="outline">
                      {permission}
                    </Badge>
                  ))}
                </div>
              </TableCell>

              {/* Rate limit */}
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {key.rateLimit === null ? 'Plan default' : `${formatNumber(key.rateLimit)} / min`}
              </TableCell>

              {/* Usage & Cost */}
              <TableCell className="whitespace-nowrap text-xs">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Coins className="h-3 w-3 text-emerald-500" />
                  <span>${cost.toFixed(2)}</span>
                </div>
                <div className="text-muted-foreground text-[11px]">
                  {formatNumber(requests)} reqs • {tokens > 1000 ? `${(tokens / 1000).toFixed(0)}k` : tokens} tok
                </div>
              </TableCell>

              {/* Last Used */}
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
              </TableCell>

              {/* Status */}
              <TableCell>
                {isExpired ? (
                  <Badge variant="destructive">Expired</Badge>
                ) : (
                  <StatusBadge status={key.status} />
                )}
              </TableCell>

              {/* Created */}
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {formatDate(key.createdAt)}
              </TableCell>

              {/* Actions */}
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
