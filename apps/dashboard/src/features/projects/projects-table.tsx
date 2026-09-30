import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
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
  /** When false the table is read-only and no actions are shown. */
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
          <TableHead>Description</TableHead>
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
          return (
            <TableRow key={project.id}>
              <TableCell className="font-medium">{project.name}</TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">
                {project.description ?? '-'}
              </TableCell>
              <TableCell>
                <StatusBadge status={project.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(project.createdAt)}
              </TableCell>
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
