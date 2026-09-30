import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ClientIp } from '../common/decorators/request.decorators';
import { Public } from '../common/decorators/public.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthService } from './auth.service';
import type { AuthResult, RegisterResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

const FIFTEEN_MINUTES = 15 * 60;

@Public()
@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit({ name: 'register', windowSeconds: 60 * 60, perIp: 10 })
  register(@Body() dto: RegisterDto, @ClientIp() ip?: string): Promise<RegisterResult> {
    return this.auth.register(dto, ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'login', windowSeconds: FIFTEEN_MINUTES, perIp: 30, perEmail: 5 })
  login(@Body() dto: LoginDto, @ClientIp() ip?: string): Promise<AuthResult> {
    return this.auth.login(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'refresh', windowSeconds: FIFTEEN_MINUTES, perIp: 60 })
  refresh(@Body() dto: RefreshTokenDto, @ClientIp() ip?: string): Promise<AuthResult> {
    return this.auth.refresh(dto.refreshToken, ip);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: 'logout', windowSeconds: FIFTEEN_MINUTES, perIp: 60 })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }
}
