import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AlertModule } from './alerts/alert.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt.guard';
import { BillingModule } from './billing/billing.module';
import { AllExceptionsFilter } from './common/exceptions/all-exceptions.filter';
import { TenantContextGuard } from './common/guards/tenant-context.guard';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health.controller';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { PermissionMiddleware } from './roles/permission.middleware';
import { RolesGuard } from './roles/roles.guard';
import { RolesModule } from './roles/roles.module';
import { SettingsModule } from './settings/settings.module';
import { TeamsModule } from './teams/teams.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    RolesModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    AnalyticsModule,
    AlertModule,
    BillingModule,
    TeamsModule,
    ProjectsModule,
    ApiKeysModule,
    SettingsModule,
  ],
  controllers: [HealthController, AppController],
  providers: [
    // Global guards run in this order: authenticate, resolve tenant, check permissions.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PermissionMiddleware).forRoutes('*');
  }
}

