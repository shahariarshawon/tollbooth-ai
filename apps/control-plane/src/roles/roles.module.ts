import { Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { PermissionMiddleware } from './permission.middleware';

@Module({
  providers: [RolesGuard, PermissionMiddleware],
  exports: [RolesGuard, PermissionMiddleware],
})
export class RolesModule {}

