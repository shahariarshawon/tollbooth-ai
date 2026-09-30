import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import { createHash } from 'node:crypto';
import { GatewayErrors } from '../common/errors/gateway.exception';
import type { ApiKeyAuth } from '../common/types/gateway-request';

// Cheap shape check before touching the database, so garbage never costs a query.
const KEY_SHAPE = /^tb_[A-Za-z0-9_]{16,200}$/;

// lastUsedAt is informational; writing it on every request would turn every read into a write.
const LAST_USED_GRANULARITY_MS = 60_000;

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** SHA-256 hex, the same scheme the control plane and seed use when they store a key. */
  static hash(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  /**
   * Turns a raw key into the caller identity: hash it, look the hash up (the raw key is never stored
   * or compared), then confirm the key, its tenant and its project are all usable.
   */
  async authenticate(rawKey: string): Promise<ApiKeyAuth> {
    if (!KEY_SHAPE.test(rawKey)) throw GatewayErrors.invalidApiKey();

    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: ApiKeyService.hash(rawKey) },
      select: {
        id: true,
        tenantId: true,
        projectId: true,
        permissions: true,
        rateLimit: true,
        status: true,
        expiresAt: true,
        lastUsedAt: true,
        tenant: { select: { status: true, plan: true } },
        project: { select: { status: true } },
      },
    });

    const now = new Date();
    // Unknown, revoked and expired keys are indistinguishable to the caller.
    if (!key || key.status !== 'ACTIVE' || (key.expiresAt && key.expiresAt <= now)) {
      throw GatewayErrors.invalidApiKey();
    }
    if (key.tenant.status !== 'ACTIVE' || key.project.status !== 'ACTIVE') {
      throw GatewayErrors.accountInactive();
    }

    if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS) {
      void this.prisma.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: now } })
        .catch((error: unknown) =>
          this.logger.warn(`Could not update lastUsedAt: ${String(error).slice(0, 200)}`),
        );
    }

    return {
      apiKeyId: key.id,
      tenantId: key.tenantId,
      projectId: key.projectId,
      plan: key.tenant.plan,
      permissions: key.permissions,
      rateLimit: key.rateLimit,
    };
  }
}
