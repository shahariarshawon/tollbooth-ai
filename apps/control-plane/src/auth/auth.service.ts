import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, PrismaService } from '@tollbooth/database';
import { randomUUID } from 'node:crypto';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { USER_SELECT } from '../users/user.select';
import type { UserResponse } from '../users/user.select';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenService, toSessionUser } from './token.service';
import type { SessionUser } from './token.service';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
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
      include: { tenant: { select: { status: true } } },
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

    const sessionUser = toSessionUser(user);
    const refreshToken = await this.tokens.issueRefreshToken(user.id, randomUUID());
    return this.buildResult(sessionUser, refreshToken);
  }

  async refresh(rawRefreshToken: string, ipAddress?: string): Promise<AuthResult> {
    const { user, refreshToken } = await this.tokens.rotate(rawRefreshToken, ipAddress);
    return this.buildResult(user, refreshToken);
  }

  private async buildResult(user: SessionUser, refreshToken: string): Promise<AuthResult> {
    const { accessToken, expiresIn } = await this.tokens.signAccessToken(user);
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn, user };
  }

  logout(rawRefreshToken: string): Promise<void> {
    return this.tokens.revoke(rawRefreshToken);
  }
}
