import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { PrismaService } from '@tollbooth/database';
import type { UserRole } from '@tollbooth/database';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import type { AuthenticatedUser } from '../common/types/authenticated-request';

export const JWT_ISSUER = 'tollbooth-control-plane';

export interface JwtPayload {
  /** User id (standard claim). */
  sub: string;
  userId: string;
  tenantId: string | null;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.JWT_SECRET,
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      ignoreExpiration: false,
    });
  }

  /**
   * A valid signature only proves who the token was issued to. Account state, tenant and role are
   * re-read from the database so disabling a user, suspending a tenant or changing a role takes
   * effect immediately instead of when the token expires.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        tenantId: true,
        role: true,
        status: true,
        tenant: { select: { id: true, slug: true, status: true } },
      },
    });

    if (
      !user ||
      user.status === 'DISABLED' ||
      user.tenantId !== payload.tenantId ||
      (user.tenant && user.tenant.status !== 'ACTIVE')
    ) {
      throw new UnauthorizedException('Authentication required');
    }

    return { userId: user.id, tenantId: user.tenantId, role: user.role, tenant: user.tenant };
  }
}
