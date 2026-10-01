'use client';

import * as React from 'react';
import {
  Download,
  Filter,
  Search,
  Shield,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { AccessDenied, Can } from '@/features/auth/can';
import { auditLogService } from '@/services/audit-log.service';
import { useAuditLogs } from './hooks';
import { AuditLogsTable } from './audit-logs-table';

const ACTION_OPTIONS = [
  { label: 'All Actions', value: '' },
  { label: 'Login (Success)', value: 'LOGIN' },
  { label: 'Login Failed', value: 'LOGIN_FAILED' },
  { label: 'Logout', value: 'LOGOUT' },
  { label: 'API Key Created', value: 'API_KEY_CREATED' },
  { label: 'API Key Revoked', value: 'API_KEY_REVOKED' },
  { label: 'User Created', value: 'USER_CREATED' },
  { label: 'Role Changed', value: 'USER_ROLE_CHANGED' },
  { label: 'Team Created', value: 'TEAM_CREATED' },
  { label: 'Team Limits Changed', value: 'TEAM_LIMITS_CHANGED' },
  { label: 'Budget Limit Changed', value: 'BUDGET_LIMIT_CHANGED' },
  { label: 'Settings Updated', value: 'SETTINGS_UPDATED' },
  { label: 'Model Access Changed', value: 'MODEL_ACCESS_CHANGED' },
];

const RESOURCE_OPTIONS = [
  { label: 'All Resources', value: '' },
  { label: 'Auth', value: 'Auth' },
  { label: 'ApiKey', value: 'ApiKey' },
  { label: 'User', value: 'User' },
  { label: 'Team', value: 'Team' },
  { label: 'Project', value: 'Project' },
  { label: 'Settings', value: 'Settings' },
  { label: 'Billing', value: 'Billing' },
];

const DATE_RANGE_OPTIONS = [
  { label: 'All time', days: 0 },
  { label: 'Today', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
];

function AuditLogsContent() {
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedAction, setSelectedAction] = React.useState('');
  const [selectedResource, setSelectedResource] = React.useState('');
  const [selectedDateRange, setSelectedDateRange] = React.useState(0);
  const [page, setPage] = React.useState(1);

  // Debounce search input
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Compute from date based on range preset
  const dateFrom = React.useMemo(() => {
    if (selectedDateRange === 0) return undefined;
    const d = new Date();
    d.setDate(d.getDate() - selectedDateRange);
    return d.toISOString();
  }, [selectedDateRange]);

  const queryParams = {
    search: debouncedSearch || undefined,
    action: selectedAction || undefined,
    resource: selectedResource || undefined,
    from: dateFrom,
    page,
    limit: 20,
  };

  const auditQuery = useAuditLogs(queryParams);

  const handleExportCsv = () => {
    const url = auditLogService.exportCsvUrl(queryParams);
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Chronological audit trail of authentication, user role changes, API governance, and limit modifications."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => auditQuery.refetch()}
              disabled={auditQuery.isFetching}
              className="gap-2 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${auditQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="gap-2 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-card/60 backdrop-blur-sm border-border/70 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by actor, action, resource, or IP address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs h-9 bg-background/50"
            />
          </div>

          {/* Action Filter */}
          <div className="w-full md:w-48">
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs h-9 px-3 rounded-md border border-input bg-background/50 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Resource Filter */}
          <div className="w-full md:w-36">
            <select
              value={selectedResource}
              onChange={(e) => {
                setSelectedResource(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs h-9 px-3 rounded-md border border-input bg-background/50 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {RESOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Preset */}
          <div className="w-full md:w-36">
            <select
              value={selectedDateRange}
              onChange={(e) => {
                setSelectedDateRange(Number(e.target.value));
                setPage(1);
              }}
              className="w-full text-xs h-9 px-3 rounded-md border border-input bg-background/50 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.days} value={opt.days}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Main Table & Boundary */}
      <Card className="p-0 overflow-hidden border-border/70">
        <QueryBoundary
          query={auditQuery}
          loading={<TableSkeleton columns={6} rows={8} />}
          isEmpty={(resp) => !resp || resp.logs.length === 0}
          empty={
            <EmptyState
              icon={Shield}
              title="No audit logs found"
              description={
                debouncedSearch || selectedAction || selectedResource || selectedDateRange > 0
                  ? 'Try broadening your search or clearing active filters.'
                  : 'Actions performed across your tenant will be recorded here.'
              }
            />
          }
        >
          {(resp) => (
            <>
              <AuditLogsTable logs={resp.logs} />

              {/* Pagination Controls */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
                <div>
                  Showing {resp.logs.length > 0 ? (resp.page - 1) * resp.limit + 1 : 0} to{' '}
                  {Math.min(resp.page * resp.limit, resp.total)} of {resp.total} events
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span className="sr-only">Previous page</span>
                  </Button>
                  <span className="font-medium text-foreground">
                    Page {resp.page} of {Math.max(1, resp.totalPages)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= resp.totalPages}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span className="sr-only">Next page</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </QueryBoundary>
      </Card>
    </div>
  );
}

export function AuditLogsPage() {
  return (
    <Can
      perform={Permission.VIEW_AUDIT_LOGS}
      fallback={<AccessDenied message="You do not have permission to view tenant audit logs." />}
    >
      <AuditLogsContent />
    </Can>
  );
}
