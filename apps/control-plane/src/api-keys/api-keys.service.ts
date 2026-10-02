import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '@tollbooth/database';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { CreateApiKeyDto } from './dto/api-keys.dto';

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { tenantId },
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    return Promise.all(
      keys.map(async (key) => {
        const stats = await this.prisma.aiRequest.aggregate({
          where: {
            tenantId,
            apiKeyId: key.id,
            createdAt: { gte: startOfMonth },
          },
          _count: { _all: true },
          _sum: { totalTokens: true, estimatedCost: true },
        });

        return {
          id: key.id,
          name: key.name,
          keyPrefix: key.keyPrefix,
          projectId: key.projectId,
          projectName: key.project.name,
          teamId: key.teamId,
          teamName: key.team?.name ?? null,
          permissions: key.permissions,
          rateLimit: key.rateLimit,
          status: key.status,
          expiresAt: key.expiresAt,
          lastUsedAt: key.lastUsedAt,
          createdAt: key.createdAt,
          requestsCount: stats._count._all,
          totalTokens: Number(stats._sum.totalTokens ?? 0),
          totalCost: Number(Number(stats._sum.estimatedCost ?? 0).toFixed(4)),
        };
      }),
    );
  }

  async create(tenantId: string, dto: CreateApiKeyDto, actorUserId?: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, tenantId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const teamId = dto.teamId ?? project.teamId;
    if (teamId) {
      const team = await this.prisma.team.findFirst({ where: { id: teamId, tenantId } });
      if (!team) throw new NotFoundException('Team not found');
    }

    const rawKey = `tb_live_${randomBytes(24).toString('hex')}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 14);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        tenantId,
        projectId: project.id,
        teamId: teamId ?? null,
        name: dto.name.trim(),
        keyHash,
        keyPrefix,
        permissions: dto.permissions ?? ['chat:completions'],
        rateLimit: dto.rateLimit,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await this.audit.record({
      action: AuditAction.API_KEY_CREATED,
      resource: 'api_keys',
      resourceId: apiKey.id,
      tenantId,
      userId: actorUserId,
      metadata: { name: apiKey.name, prefix: keyPrefix, projectId: project.id, teamId },
    });

    return {
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        projectId: apiKey.projectId,
        projectName: apiKey.project.name,
        teamId: apiKey.teamId,
        teamName: apiKey.team?.name ?? null,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        status: apiKey.status,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        createdAt: apiKey.createdAt,
      },
      secret: rawKey,
    };
  }

  async revoke(tenantId: string, id: string, actorUserId?: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!key) throw new NotFoundException('API key not found');

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { status: 'REVOKED' },
    });

    await this.audit.record({
      action: AuditAction.API_KEY_REVOKED,
      resource: 'api_keys',
      resourceId: id,
      tenantId,
      userId: actorUserId,
      metadata: { name: key.name, keyPrefix: key.keyPrefix },
    });

    return updated;
  }

  async rotate(tenantId: string, id: string, actorUserId?: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
      include: { project: true, team: true },
    });
    if (!key) throw new NotFoundException('API key not found');
    if (key.status === 'REVOKED') {
      throw new BadRequestException('A revoked key cannot be rotated');
    }

    const rawKey = `tb_live_${randomBytes(24).toString('hex')}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 14);

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { keyHash, keyPrefix, lastUsedAt: null },
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await this.audit.record({
      action: AuditAction.API_KEY_CREATED,
      resource: 'api_keys',
      resourceId: id,
      tenantId,
      userId: actorUserId,
      metadata: { name: key.name, rotation: true, prefix: keyPrefix },
    });

    return {
      apiKey: {
        id: updated.id,
        name: updated.name,
        keyPrefix: updated.keyPrefix,
        projectId: updated.projectId,
        projectName: updated.project.name,
        teamId: updated.teamId,
        teamName: updated.team?.name ?? null,
        permissions: updated.permissions,
        rateLimit: updated.rateLimit,
        status: updated.status,
        expiresAt: updated.expiresAt,
        lastUsedAt: updated.lastUsedAt,
        createdAt: updated.createdAt,
      },
      secret: rawKey,
    };
  }

  async delete(tenantId: string, id: string, actorUserId?: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!key) throw new NotFoundException('API key not found');

    await this.prisma.apiKey.delete({ where: { id } });

    await this.audit.record({
      action: AuditAction.API_KEY_DELETED,
      resource: 'api_keys',
      resourceId: id,
      tenantId,
      userId: actorUserId,
      metadata: { name: key.name },
    });
  }
}
