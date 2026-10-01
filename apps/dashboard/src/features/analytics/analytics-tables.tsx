import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AnalyticsUsage, ModelUsageRow } from '@/types/api';
import { formatCompactNumber, formatCurrency, formatNumber } from '@/utils/format';

function TableCard({
  title,
  description,
  isEmpty,
  children,
}: {
  title: string;
  description: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            title="No activity yet"
            description="This will fill in once requests come in."
          />
        ) : (
          <Table>{children}</Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TopModelsTable({ models }: { models: ModelUsageRow[] }) {
  const top = models.slice(0, 5);
  return (
    <TableCard title="Top models" description="By request volume" isEmpty={top.length === 0}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Model</TableHead>
          <TableHead>Requests</TableHead>
          <TableHead>Tokens</TableHead>
          {top.some((row) => row.cost !== null) && <TableHead>Cost</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {top.map((row) => (
          <TableRow key={`${row.provider}-${row.model}`}>
            <TableCell className="font-medium">{row.model}</TableCell>
            <TableCell>{formatNumber(row.requests)}</TableCell>
            <TableCell>{formatCompactNumber(row.tokens)}</TableCell>
            {row.cost !== null && <TableCell>{formatCurrency(row.cost)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </TableCard>
  );
}

export function TopProjectsTable({ projects }: { projects: AnalyticsUsage['topProjects'] }) {
  return (
    <TableCard title="Top projects" description="By request volume" isEmpty={projects.length === 0}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Project</TableHead>
          <TableHead>Requests</TableHead>
          <TableHead>Tokens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell className="font-medium">{project.name}</TableCell>
            <TableCell>{formatNumber(project.requests)}</TableCell>
            <TableCell>{formatCompactNumber(project.tokens)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableCard>
  );
}

/**
 * "Top users" (as asked) is shown as the API keys driving traffic: an AiRequest is attributed to the
 * key and project that made it, not to the human who created the key, so that is the closest real
 * breakdown the data model supports without adding a column this phase does not call for.
 */
export function TopApiKeysTable({ apiKeys }: { apiKeys: AnalyticsUsage['topApiKeys'] }) {
  return (
    <TableCard
      title="Top API keys"
      description="Who is sending the traffic"
      isEmpty={apiKeys.length === 0}
    >
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Key</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Requests</TableHead>
          <TableHead>Tokens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {apiKeys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="font-medium">{key.name}</TableCell>
            <TableCell>{key.projectName}</TableCell>
            <TableCell>{formatNumber(key.requests)}</TableCell>
            <TableCell>{formatCompactNumber(key.tokens)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableCard>
  );
}
