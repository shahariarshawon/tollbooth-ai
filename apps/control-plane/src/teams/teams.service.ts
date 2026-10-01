import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from './dto/teams.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    const teams = await this.prisma.team.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { members: true, projects: true, apiKeys: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, role: true },
            },
          },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Query month-to-date requests for projects in each team
    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    return Promise.all(
      teams.map(async (team) => {
        const teamProjects = await this.prisma.project.findMany({
          where: { teamId: team.id },
          select: { id: true },
        });
        const projectIds = teamProjects.map((p) => p.id);

        let usageCost = 0;
        let totalTokens = 0;
        let totalRequests = 0;

        if (projectIds.length > 0) {
          const stats = await this.prisma.aiRequest.aggregate({
            where: {
              tenantId,
              projectId: { in: projectIds },
              createdAt: { gte: startOfMonth },
            },
            _sum: { estimatedCost: true, totalTokens: true },
            _count: { _all: true },
          });
          usageCost = Number(stats._sum.estimatedCost ?? 0);
          totalTokens = Number(stats._sum.totalTokens ?? 0);
          totalRequests = stats._count._all;
        }

        return {
          id: team.id,
          name: team.name,
          description: team.description,
          rateLimitRpm: team.rateLimitRpm,
          rateLimitRpd: team.rateLimitRpd,
          tokenLimitTpm: team.tokenLimitTpm,
          tokenLimitTpd: team.tokenLimitTpd,
          dailyBudget: team.dailyBudget ? Number(team.dailyBudget) : null,
          monthlyBudget: team.monthlyBudget ? Number(team.monthlyBudget) : null,
          allowedModels: team.allowedModels,
          membersCount: team._count.members,
          projectsCount: team._count.projects,
          apiKeysCount: team._count.apiKeys,
          members: team.members.map((m) => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            user: m.user,
          })),
          currentUsageCost: Number(usageCost.toFixed(4)),
          currentTokens: totalTokens,
          currentRequests: totalRequests,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
        };
      }),
    );
  }

  async getById(tenantId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, tenantId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, role: true },
            },
          },
        },
        projects: {
          select: { id: true, name: true, status: true, description: true },
        },
        apiKeys: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            status: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!team) throw new NotFoundException('Team not found');

    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const projectIds = team.projects.map((p) => p.id);

    let usageCost = 0;
    let totalTokens = 0;
    let totalRequests = 0;

    if (projectIds.length > 0) {
      const stats = await this.prisma.aiRequest.aggregate({
        where: {
          tenantId,
          projectId: { in: projectIds },
          createdAt: { gte: startOfMonth },
        },
        _sum: { estimatedCost: true, totalTokens: true },
        _count: { _all: true },
      });
      usageCost = Number(stats._sum.estimatedCost ?? 0);
      totalTokens = Number(stats._sum.totalTokens ?? 0);
      totalRequests = stats._count._all;
    }

    return {
      ...team,
      dailyBudget: team.dailyBudget ? Number(team.dailyBudget) : null,
      monthlyBudget: team.monthlyBudget ? Number(team.monthlyBudget) : null,
      currentUsageCost: Number(usageCost.toFixed(4)),
      currentTokens: totalTokens,
      currentRequests: totalRequests,
    };
  }

  async create(tenantId: string, dto: CreateTeamDto, actorUserId?: string): Promise<any> {
    const existing = await this.prisma.team.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name.trim() } },
    });
    if (existing) {
      throw new ConflictException(`A team named "${dto.name}" already exists`);
    }

    const team = await this.prisma.team.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        rateLimitRpm: dto.rateLimitRpm,
        rateLimitRpd: dto.rateLimitRpd,
        tokenLimitTpm: dto.tokenLimitTpm,
        tokenLimitTpd: dto.tokenLimitTpd,
        dailyBudget: dto.dailyBudget,
        monthlyBudget: dto.monthlyBudget,
        allowedModels: dto.allowedModels ?? [],
      },
    });

    await this.audit.record({
      action: AuditAction.TEAM_CREATED,
      resource: 'teams',
      resourceId: team.id,
      tenantId,
      userId: actorUserId,
      metadata: { name: team.name, monthlyBudget: team.monthlyBudget },
    });

    return team;
  }

  async update(tenantId: string, id: string, dto: UpdateTeamDto, actorUserId?: string): Promise<any> {
    await this.getById(tenantId, id);

    if (dto.name) {
      const conflict = await this.prisma.team.findFirst({
        where: { tenantId, name: dto.name.trim(), id: { not: id } },
      });
      if (conflict) throw new ConflictException(`Team name "${dto.name}" is already taken`);
    }

    const updated = await this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() }),
        ...(dto.rateLimitRpm !== undefined && { rateLimitRpm: dto.rateLimitRpm }),
        ...(dto.rateLimitRpd !== undefined && { rateLimitRpd: dto.rateLimitRpd }),
        ...(dto.tokenLimitTpm !== undefined && { tokenLimitTpm: dto.tokenLimitTpm }),
        ...(dto.tokenLimitTpd !== undefined && { tokenLimitTpd: dto.tokenLimitTpd }),
        ...(dto.dailyBudget !== undefined && { dailyBudget: dto.dailyBudget }),
        ...(dto.monthlyBudget !== undefined && { monthlyBudget: dto.monthlyBudget }),
        ...(dto.allowedModels !== undefined && { allowedModels: dto.allowedModels }),
      },
    });

    await this.audit.record({
      action: AuditAction.TEAM_UPDATED,
      resource: 'teams',
      resourceId: updated.id,
      tenantId,
      userId: actorUserId,
      metadata: { ...dto },
    });

    return updated;
  }

  async delete(tenantId: string, id: string, actorUserId?: string) {
    const team = await this.getById(tenantId, id);

    // Detach projects and apiKeys before deleting team
    await this.prisma.$transaction([
      this.prisma.project.updateMany({ where: { teamId: id }, data: { teamId: null } }),
      this.prisma.apiKey.updateMany({ where: { teamId: id }, data: { teamId: null } }),
      this.prisma.team.delete({ where: { id } }),
    ]);

    await this.audit.record({
      action: AuditAction.TEAM_DELETED,
      resource: 'teams',
      resourceId: id,
      tenantId,
      userId: actorUserId,
      metadata: { name: team.name },
    });
  }

  async addMember(tenantId: string, teamId: string, dto: AddTeamMemberDto, actorUserId?: string) {
    await this.getById(tenantId, teamId);

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId },
    });
    if (!user) throw new NotFoundException('User not found in this tenant');

    const member = await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: dto.userId } },
      update: { role: dto.role },
      create: { teamId, userId: dto.userId, role: dto.role },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    await this.audit.record({
      action: AuditAction.TEAM_MEMBER_ADDED,
      resource: 'team_members',
      resourceId: member.id,
      tenantId,
      userId: actorUserId,
      metadata: { teamId, memberUserId: dto.userId, role: dto.role },
    });

    return member;
  }

  async removeMember(tenantId: string, teamId: string, userId: string, actorUserId?: string) {
    await this.getById(tenantId, teamId);

    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member) throw new NotFoundException('Member not found in team');

    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });

    await this.audit.record({
      action: AuditAction.TEAM_MEMBER_REMOVED,
      resource: 'team_members',
      resourceId: member.id,
      tenantId,
      userId: actorUserId,
      metadata: { teamId, memberUserId: userId },
    });
  }
}
