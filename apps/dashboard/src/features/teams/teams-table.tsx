'use client';

import * as React from 'react';
import {
  Users,
  KeyRound,
  FolderGit2,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
  Zap,
  Coins,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Team } from '@/types/api';

interface TeamsTableProps {
  teams: Team[];
  onEdit: (team: Team) => void;
  onManageMembers: (team: Team) => void;
  onDelete: (team: Team) => void;
}

export function TeamsTable({ teams, onEdit, onManageMembers, onDelete }: TeamsTableProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="font-semibold text-foreground py-3.5">Team</TableHead>
            <TableHead className="font-semibold text-foreground">Members</TableHead>
            <TableHead className="font-semibold text-foreground">Rate Limits</TableHead>
            <TableHead className="font-semibold text-foreground">Token Limits</TableHead>
            <TableHead className="font-semibold text-foreground">Budget & Spend</TableHead>
            <TableHead className="font-semibold text-foreground">Allowed Models</TableHead>
            <TableHead className="font-semibold text-foreground">Resources</TableHead>
            <TableHead className="text-right font-semibold text-foreground pr-6">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => {
            const monthlyBudget = team.monthlyBudget ? Number(team.monthlyBudget) : null;
            const currentSpend = Number(team.currentUsageCost ?? 0);
            const budgetPercent = monthlyBudget && monthlyBudget > 0
              ? Math.min(100, Math.round((currentSpend / monthlyBudget) * 100))
              : null;

            return (
              <TableRow key={team.id} className="hover:bg-muted/30 transition-colors">
                {/* Team Info */}
                <TableCell className="py-4">
                  <div className="font-medium text-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    <span>{team.name}</span>
                  </div>
                  {team.description ? (
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                      {team.description}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 italic mt-0.5">
                      No description provided
                    </p>
                  )}
                </TableCell>

                {/* Members */}
                <TableCell>
                  <button
                    onClick={() => onManageMembers(team)}
                    className="flex items-center gap-2 group text-left hover:opacity-85 transition-opacity"
                    title="Click to manage team members"
                  >
                    <div className="flex -space-x-2 overflow-hidden">
                      {team.members.slice(0, 3).map((m) => {
                        const fullName = `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim();
                        const initials = fullName ? fullName.slice(0, 2) : m.user.email.slice(0, 2);
                        return (
                          <Avatar
                            key={m.id}
                            className="inline-block h-7 w-7 ring-2 ring-background border border-border/40"
                          >
                            <AvatarFallback className="text-[10px] font-semibold uppercase bg-secondary text-secondary-foreground">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                    </div>
                    <Badge variant="outline" className="text-xs font-normal group-hover:border-primary/60">
                      <Users className="h-3 w-3 mr-1 text-muted-foreground" />
                      {team.members.length}
                    </Badge>
                  </button>
                </TableCell>

                {/* Rate Limits */}
                <TableCell>
                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-1.5 text-foreground">
                      <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                      <span>{team.rateLimitRpm ? `${team.rateLimitRpm.toLocaleString()} RPM` : '∞ RPM'}</span>
                    </div>
                    <div className="text-muted-foreground pl-4.5">
                      {team.rateLimitRpd ? `${team.rateLimitRpd.toLocaleString()} RPD` : 'Unlimited / day'}
                    </div>
                  </div>
                </TableCell>

                {/* Token Limits */}
                <TableCell>
                  <div className="space-y-0.5 text-xs">
                    <div className="text-foreground font-medium">
                      {team.tokenLimitTpm ? `${(team.tokenLimitTpm / 1000).toLocaleString()}k TPM` : '∞ TPM'}
                    </div>
                    <div className="text-muted-foreground">
                      {team.tokenLimitTpd ? `${(team.tokenLimitTpd / 1_000_000).toFixed(1)}M TPD` : 'Unlimited tokens'}
                    </div>
                  </div>
                </TableCell>

                {/* Budget & Spend */}
                <TableCell>
                  <div className="space-y-1 text-xs min-w-[130px]">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <Coins className="h-3 w-3 text-emerald-500" />
                        ${currentSpend.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">
                        {monthlyBudget ? `/ $${monthlyBudget.toFixed(0)}` : '(No cap)'}
                      </span>
                    </div>
                    {budgetPercent !== null && (
                      <div className="w-full bg-secondary/80 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            budgetPercent > 90
                              ? 'bg-destructive'
                              : budgetPercent > 75
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${budgetPercent}%` }}
                        />
                      </div>
                    )}
                    {team.dailyBudget && (
                      <div className="text-[10px] text-muted-foreground">
                        Daily cap: ${Number(team.dailyBudget).toFixed(2)}
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* Allowed Models */}
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {team.allowedModels && team.allowedModels.length > 0 ? (
                      team.allowedModels.slice(0, 2).map((m) => (
                        <Badge
                          key={m}
                          variant="outline"
                          className="text-[10px] font-mono px-1.5 py-0 bg-primary/10 text-primary border-primary/20"
                        >
                          {m.replace(/^models\//, '')}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        All Models
                      </Badge>
                    )}
                    {team.allowedModels && team.allowedModels.length > 2 && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        +{team.allowedModels.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>

                {/* Resources */}
                <TableCell>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1" title="Projects in team">
                      <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground/80" />
                      {team.projectsCount ?? 0}
                    </span>
                    <span className="flex items-center gap-1" title="API Keys assigned">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground/80" />
                      {team.apiKeysCount ?? 0}
                    </span>
                  </div>
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right pr-6">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onManageMembers(team)}>
                        <UserPlus className="h-4 w-4 mr-2 text-primary" />
                        Manage Members
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(team)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Limits & Config
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(team)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Team
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
