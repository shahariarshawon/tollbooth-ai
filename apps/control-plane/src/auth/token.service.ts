import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { durationToSeconds } from '@tollbooth/config';
import { Prisma, PrismaService } from '@tollbooth/database';
import type { UserRole } from '@tollbooth/database';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import type { JwtPayload } from './jwt.strategy';

export interface SessionUser {
  id: string;
  tenantId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

const SESSION_USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  tenant: { select: { status: true } },
} satisfies Prisma.UserSelect;

type RefreshClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  static hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async signAccessToken(
    user: Pick<SessionUser, 'id' | 'tenantId' | 'role'>,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const payload: JwtPayload = {
      sub: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: durationToSeconds(this.config.JWT_ACCESS_EXPIRE),
    };
  }

  /**
   * Creates an opaque random refresh token and stores only its SHA-256 hash. The token has 384 bits
   * of entropy, so a fast hash is sufficient and lets us look it up by hash.
   */
  async issueRefreshToken(
    userId: string,
    familyId: string = randomUUID(),
    client: RefreshClient = this.prisma,
  ): Promise<string> {
    const rawToken = randomBytes(48).toString('base64url');
    await client.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: TokenService.hash(rawToken),
        expiresAt: new Date(Date.now() + durationToSeconds(this.config.JWT_REFRESH_EXPIRE) * 1000),
      },
    });
    return rawToken;
  }

  /**
   * Exchanges a refresh token for a new one (rotation). The presented token is revoked atomically,
   * so it works exactly once. Presenting an already-revoked token means it was replayed or stolen:
   * the whole family is revoked, forcing a fresh login.
   */
  async rotate(
    rawToken: string,
    ipAddress?: string,
  ): Promise<{ user: SessionUser; refreshToken: string }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hash(rawToken) },
      include: { user: { select: SESSION_USER_SELECT } },
    });
    if (!stored) throw this.invalid();
    if (stored.revokedAt) return this.rejectReuse(stored, ipAddress);
    if (stored.expiresAt <= new Date()) throw this.invalid();

    const { user } = stored;
    if (user.status === 'DISABLED' || (user.tenant && user.tenant.status !== 'ACTIVE')) {
      throw this.invalid();
    }

    const refreshToken = await this.prisma.$transaction(async (tx) => {
      // Only one concurrent caller can flip revokedAt from null; the loser is treated as a replay.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return claimed.count === 1 ? this.issueRefreshToken(user.id, stored.familyId, tx) : null;
    });
    if (!refreshToken) return this.rejectReuse(stored, ipAddress);

    return { user: toSessionUser(user), refreshToken };
  }

  /** Ends a session by revoking the whole family of the presented token. Unknown tokens are ignored. */
  async revoke(rawToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hash(rawToken) },
      select: { familyId: true },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async revokeAllForUser(userId: string, client: RefreshClient = this.prisma): Promise<void> {
    await client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private revokeFamily(familyId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async rejectReuse(
    stored: { userId: string; familyId: string; user: { tenantId: string | null } },
    ipAddress?: string,
  ): Promise<never> {
    const { count } = await this.revokeFamily(stored.familyId);
    // Once a family is fully revoked, further attempts with its tokens are not new incidents.
    if (count > 0) {
      await this.audit.record({
        action: AuditAction.TOKEN_REUSE_DETECTED,
        resource: 'refresh_token',
        tenantId: stored.user.tenantId,
        userId: stored.userId,
        ipAddress,
        metadata: { familyId: stored.familyId },
      });
    }
    throw this.invalid();
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException('Invalid refresh token');
  }
}

export function toSessionUser(user: SessionUser): SessionUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}
