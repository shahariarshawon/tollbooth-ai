import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { durationToSeconds } from '@tollbooth/config';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { RATE_LIMIT_STORE } from '../common/rate-limit/rate-limit.store';
import { RedisRateLimitStore } from '../common/rate-limit/redis-rate-limit.store';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JWT_ISSUER, JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_SECRET,
        signOptions: {
          algorithm: 'HS256' as const,
          issuer: JWT_ISSUER,
          expiresIn: durationToSeconds(config.JWT_ACCESS_EXPIRE),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    JwtStrategy,
    RateLimitGuard,
    { provide: RATE_LIMIT_STORE, useClass: RedisRateLimitStore },
  ],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
