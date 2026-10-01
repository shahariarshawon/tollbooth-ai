import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    const projects = await this.prisma.project.findMany({
      where: { tenantId },
      include: {
        team: { select: { id: true, name: true } },
        _count: { select: { apiKeys: true, aiRequests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    return Promise.all(
      projects.map(async (project) => {
        const stats = await this.prisma.aiRequest.aggregate({
          where: {
            tenantId,
            projectId: project.id,
            createdAt: { gte: startOfMonth },
          },
          _sum: { estimatedCost: true, totalTokens: true },
          _count: { _all: true },
        });

        return {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          teamId: project.teamId,
          team: project.team,
          allowedModels: project.allowedModels,
          monthlyBudget: project.monthlyBudget ? Number(project.monthlyBudget) : null,
          apiKeysCount: project._count.apiKeys,
          requestsCount: stats._count._all,
          totalTokens: Number(stats._sum.totalTokens ?? 0),
          totalCost: Number(Number(stats._sum.estimatedCost ?? 0).toFixed(4)),
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        };
      }),
    );
  }

  async getById(tenantId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId },
      include: {
        team: { select: { id: true, name: true } },
        apiKeys: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            status: true,
            rateLimit: true,
            expiresAt: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const stats = await this.prisma.aiRequest.aggregate({
      where: {
        tenantId,
        projectId: id,
        createdAt: { gte: startOfMonth },
      },
      _sum: { estimatedCost: true, totalTokens: true },
      _count: { _all: true },
    });

    return {
      ...project,
      monthlyBudget: project.monthlyBudget ? Number(project.monthlyBudget) : null,
      requestsCount: stats._count._all,
      totalTokens: Number(stats._sum.totalTokens ?? 0),
      totalCost: Number(Number(stats._sum.estimatedCost ?? 0).toFixed(4)),
    };
  }

  async create(tenantId: string, dto: CreateProjectDto, actorUserId?: string): Promise<any> {
    const existing = await this.prisma.project.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name.trim() } },
    });
    if (existing) {
      throw new ConflictException(`A project named "${dto.name}" already exists in this tenant`);
    }

    if (dto.teamId) {
      const team = await this.prisma.team.findFirst({ where: { id: dto.teamId, tenantId } });
      if (!team) throw new NotFoundException('Team not found');
    }

    const project = await this.prisma.project.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        teamId: dto.teamId,
        allowedModels: dto.allowedModels ?? [],
        monthlyBudget: dto.monthlyBudget,
      },
      include: {
        team: { select: { id: true, name: true } },
      },
    });

    await this.audit.record({
      action: AuditAction.PROJECT_CREATED,
      resource: 'projects',
      resourceId: project.id,
      tenantId,
      userId: actorUserId,
      metadata: { name: project.name, teamId: project.teamId },
    });

    return project;
  }

  async update(tenantId: string, id: string, dto: UpdateProjectDto, actorUserId?: string): Promise<any> {
    await this.getById(tenantId, id);

    if (dto.name) {
      const conflict = await this.prisma.project.findFirst({
        where: { tenantId, name: dto.name.trim(), id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(`Project name "${dto.name}" is already taken`);
      }
    }

    if (dto.teamId) {
      const team = await this.prisma.team.findFirst({ where: { id: dto.teamId, tenantId } });
      if (!team) throw new NotFoundException('Team not found');
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() }),
        ...(dto.status && { status: dto.status }),
        ...(dto.teamId !== undefined && { teamId: dto.teamId }),
        ...(dto.allowedModels !== undefined && { allowedModels: dto.allowedModels }),
        ...(dto.monthlyBudget !== undefined && { monthlyBudget: dto.monthlyBudget }),
      },
      include: {
        team: { select: { id: true, name: true } },
      },
    });

    await this.audit.record({
      action: AuditAction.PROJECT_UPDATED,
      resource: 'projects',
      resourceId: updated.id,
      tenantId,
      userId: actorUserId,
      metadata: { ...dto },
    });

    return updated;
  }

  async delete(tenantId: string, id: string, actorUserId?: string) {
    const project = await this.getById(tenantId, id);

    const activeKeys = await this.prisma.apiKey.count({
      where: { projectId: id, status: 'ACTIVE' },
    });
    if (activeKeys > 0) {
      throw new BadRequestException('Revoke or delete the API keys of this project before deleting it');
    }

    await this.prisma.project.delete({ where: { id } });

    await this.audit.record({
      action: AuditAction.PROJECT_DELETED,
      resource: 'projects',
      resourceId: id,
      tenantId,
      userId: actorUserId,
      metadata: { name: project.name },
    });
  }

  async getStats(tenantId: string, id: string) {
    await this.getById(tenantId, id);

    const fromDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const [modelStats, dailyStats] = await Promise.all([
      this.prisma.aiRequest.groupBy({
        by: ['model', 'provider'],
        where: { tenantId, projectId: id, createdAt: { gte: fromDate } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCost: true },
      }),
      this.prisma.$queryRaw<Array<{ day: Date; requests: bigint; tokens: bigint; cost: string }>>`
        SELECT date_trunc('day', "createdAt") as day,
               COUNT(*)::bigint as requests,
               COALESCE(SUM("totalTokens"), 0)::bigint as tokens,
               COALESCE(SUM("estimatedCost"), 0)::text as cost
        FROM ai_requests
        WHERE "tenantId" = ${tenantId}::uuid AND "projectId" = ${id}::uuid AND "createdAt" >= ${fromDate}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    return {
      models: modelStats.map((m) => ({
        model: m.model,
        provider: m.provider,
        requests: m._count._all,
        tokens: Number(m._sum.totalTokens ?? 0),
        cost: Number(Number(m._sum.estimatedCost ?? 0).toFixed(4)),
      })),
      daily: dailyStats.map((d) => ({
        day: d.day,
        requests: Number(d.requests),
        tokens: Number(d.tokens),
        cost: parseFloat(d.cost || '0'),
      })),
    };
  }
}
