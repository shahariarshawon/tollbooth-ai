import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { CurrentTenantId, CurrentUser } from '../common/decorators/request.decorators';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { SettingsService } from './settings.service';

@Controller('settings')
@RequirePermission(Permission.MANAGE_SETTINGS)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAllSettings(@CurrentTenantId() tenantId: string) {
    return this.settingsService.getAllSettings(tenantId);
  }

  @Patch(':category')
  updateSection(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('category') category: string,
    @Body() value: Record<string, unknown>,
  ) {
    return this.settingsService.updateSection(tenantId, category, value, actor.userId);
  }
}
