import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@tollbooth/database';
import { DEMO_USER_EMAIL } from '@tollbooth/shared';
import { randomUUID } from 'node:crypto';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { USER_SELECT } from '../users/user.select';
import type { UserResponse } from '../users/user.select';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenService, toSessionUser } from './token.service';
import type { IssuedRefreshToken, SessionUser } from './token.service';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
  /** Refresh token lifetime in seconds, so the client can match its cookie to it. */
  refreshExpiresIn: number;
  user: SessionUser;
}

export interface RegisterResult {
  user: UserResponse;
  tenant: { id: string; companyName: string; slug: string; plan: string };
}

const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto, ipAddress?: string): Promise<RegisterResult> {
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { companyName: dto.companyName, slug: dto.tenantSlug },
          select: { id: true, companyName: true, slug: true, plan: true },
        });
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: 'TENANT_ADMIN',
            status: 'ACTIVE',
          },
          select: USER_SELECT,
        });
        await this.audit.record(
          {
            action: AuditAction.TENANT_CREATED,
            resource: 'tenant',
            resourceId: tenant.id,
            tenantId: tenant.id,
            userId: user.id,
            ipAddress,
            metadata: { source: 'register' },
          },
          tx,
        );
        await this.audit.record(
          {
            action: AuditAction.USER_CREATED,
            resource: 'user',
            resourceId: user.id,
            tenantId: tenant.id,
            userId: user.id,
            ipAddress,
            metadata: { source: 'register', role: user.role },
          },
          tx,
        );
        return { user, tenant };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        if (target.includes('slug')) throw new ConflictException('Tenant slug is already taken');
        if (target.includes('email')) throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto, ipAddress?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { tenant: { select: { status: true, isDemo: true } } },
    });

    // Always run the password check (see PasswordService.verify) so timing is uniform.
    const passwordOk = await this.passwords.verify(dto.password, user?.passwordHash);

    const failure = !user
      ? 'unknown_user'
      : !passwordOk
        ? 'bad_password'
        : user.status === 'DISABLED'
          ? 'user_disabled'
          : user.tenant && user.tenant.status !== 'ACTIVE'
            ? 'tenant_inactive'
            : null;

    if (failure !== null || !user) {
      await this.audit.record({
        action: AuditAction.LOGIN_FAILED,
        resource: 'auth',
        tenantId: user?.tenantId,
        userId: user?.id,
        ipAddress,
        // The attempted email is only kept when it matched no account, to help spot probing.
        metadata: user ? { reason: failure } : { reason: failure, email: dto.email },
      });
      // One message for every cause, so responses never reveal which part was wrong.
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // First successful login completes an invitation.
    if (user.status === 'INVITED') {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    }

    await this.audit.record({
      action: AuditAction.LOGIN_SUCCESS,
      resource: 'auth',
      tenantId: user.tenantId,
      userId: user.id,
      ipAddress,
    });

    const refreshToken = await this.tokens.issueRefreshToken(user.id, randomUUID());
    return this.buildResult(toSessionUser(user), refreshToken);
  }

  /**
   * Starts a read-only session in the demo workspace without a password: the demo user has none (see
   * UNUSABLE_PASSWORD_HASH), so this is the only way in, and it exists only when DEMO_MODE is on. The
   * session lasts DEMO_SESSION_MINUTES in total; refreshing it never extends that. What a demo session
   * may do is decided by DemoPolicyGuard, like any other request: this method grants no permissions.
   */
  async startDemoSession(ipAddress?: string): Promise<AuthResult> {
    // With the demo off the route behaves as if it did not exist.
    if (!this.config.DEMO_MODE) throw new NotFoundException();

    const user = await this.prisma.user.findFirst({
      where: {
        email: this.config.DEMO_USER_EMAIL ?? DEMO_USER_EMAIL,
        status: 'ACTIVE',
        tenant: { isDemo: true, status: 'ACTIVE' },
      },
      include: { tenant: { select: { status: true, isDemo: true } } },
    });
    if (!user) throw new ServiceUnavailableException('The demo workspace is not set up');

    await this.audit.record({
      action: AuditAction.DEMO_SESSION_STARTED,
      resource: 'auth',
      tenantId: user.tenantId,
      userId: user.id,
      ipAddress,
    });

    const refreshToken = await this.tokens.issueRefreshToken(
      user.id,
      randomUUID(),
      undefined,
      new Date(Date.now() + this.config.DEMO_SESSION_MINUTES * 60_000),
    );
    return this.buildResult(toSessionUser(user), refreshToken);
  }

  async refresh(rawRefreshToken: string, ipAddress?: string): Promise<AuthResult> {
    const { user, refreshToken } = await this.tokens.rotate(rawRefreshToken, ipAddress);
    return this.buildResult(user, refreshToken);
  }

  private async buildResult(user: SessionUser, refresh: IssuedRefreshToken): Promise<AuthResult> {
    const { accessToken, expiresIn } = await this.tokens.signAccessToken(user, refresh.expiresAt);
    return {
      accessToken,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn,
      refreshExpiresIn: Math.max(1, Math.ceil((refresh.expiresAt.getTime() - Date.now()) / 1000)),
      user,
    };
  }

  logout(rawRefreshToken: string): Promise<void> {
    return this.tokens.revoke(rawRefreshToken);
  }
}
