import { Module } from '@nestjs/common';
import { SecurityGuard } from './security.guard';
import { SecurityService } from './security.service';

@Module({
  providers: [SecurityService, SecurityGuard],
  // SecurityGuard is named in GatewayController's @UseGuards, so Nest builds it inside GatewayModule;
  // what it depends on (SecurityService) has to be exported alongside it, the same as every other guard
  // in this app (see traffic.module.ts).
  exports: [SecurityGuard, SecurityService],
})
export class SecurityModule {}
