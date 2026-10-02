'use client';

import * as React from 'react';
import { Archive, ArchiveRestore, Pencil, Trash2, Users, Coins } from 'lucide-react';
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
import type { Project } from '@/types/api';
import { formatDate } from '@/utils/format';

interface ProjectsTableProps {
  projects: Project[];
  canManage: boolean;
  onEdit: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectsTable({
  projects,
  canManage,
  onEdit,
  onToggleArchive,
  onDelete,
}: ProjectsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Project</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Allowed Models</TableHead>
          <TableHead>Budget & Spend</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => {
          const archived = project.status === 'ARCHIVED';
          const budget = project.monthlyBudget ? Number(project.monthlyBudget) : null;
          const currentCost = Number(project.totalCost ?? 0);

          return (
            <TableRow key={project.id}>
              {/* Project Name & Description */}
              <TableCell>
                <div className="font-medium text-foreground">{project.name}</div>
                <div className="max-w-xs truncate text-xs text-muted-foreground mt-0.5">
                  {project.description || 'No description'}
                </div>
              </TableCell>

              {/* Team */}
              <TableCell>
                {project.team ? (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    {project.team.name}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground italic">None (Tenant)</span>
                )}
              </TableCell>

              {/* Allowed Models */}
              <TableCell>
                <div className="flex flex-wrap gap-1 max-w-[180px]">
                  {project.allowedModels && project.allowedModels.length > 0 ? (
                    project.allowedModels.slice(0, 2).map((m) => (
                      <Badge
                        key={m}
                        variant="outline"
                        className="text-[10px] font-mono px-1.5 py-0 bg-primary/5 text-primary border-primary/20"
                      >
                        {m.replace(/^models\//, '')}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">All Models</span>
                  )}
                  {project.allowedModels && project.allowedModels.length > 2 && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      +{project.allowedModels.length - 2}
                    </Badge>
                  )}
                </div>
              </TableCell>

              {/* Budget & Spend */}
              <TableCell>
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-foreground flex items-center gap-1">
                    <Coins className="h-3 w-3 text-emerald-500" />
                    ${currentCost.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {budget ? `Limit: $${budget}` : 'No cap'}
                  </div>
                </div>
              </TableCell>

              {/* Status */}
              <TableCell>
                <StatusBadge status={project.status} />
              </TableCell>

              {/* Created */}
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(project.createdAt)}
              </TableCell>

              {/* Actions */}
              <TableCell>
                <RowActions
                  label={`Actions for ${project.name}`}
                  actions={[
                    {
                      label: 'Edit',
                      icon: <Pencil />,
                      onSelect: () => onEdit(project),
                      hidden: !canManage,
                    },
                    {
                      label: archived ? 'Restore' : 'Archive',
                      icon: archived ? <ArchiveRestore /> : <Archive />,
                      onSelect: () => onToggleArchive(project),
                      hidden: !canManage,
                    },
                    {
                      label: 'Delete',
                      icon: <Trash2 />,
                      onSelect: () => onDelete(project),
                      destructive: true,
                      separated: true,
                      hidden: !canManage,
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
