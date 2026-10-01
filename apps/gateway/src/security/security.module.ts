import { Module } from '@nestjs/common';
import { AlertModule } from '../alerts/alert.module';
import { SecurityGuard } from './security.guard';
import { SecurityService } from './security.service';

@Module({
  imports: [AlertModule],
  providers: [SecurityService, SecurityGuard],
  // SecurityGuard is named in GatewayController's @UseGuards, so Nest builds it inside GatewayModule;
  // what it depends on (SecurityService, now AlertService too) has to be exported alongside it, the same
  // as every other guard in this app (see traffic.module.ts). AlertModule is re-exported, not just
  // imported, so AlertService (declared in that module, not this one) is visible to GatewayModule too.
  exports: [SecurityGuard, SecurityService, AlertModule],
})
export class SecurityModule {}
