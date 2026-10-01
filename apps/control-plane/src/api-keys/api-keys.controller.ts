import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentTenantId, CurrentUser } from '../common/decorators/request.decorators';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-keys.dto';

@Controller('api-keys')
@RequirePermission(Permission.API_KEY_READ)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  list(@CurrentTenantId() tenantId: string) {
    return this.apiKeysService.list(tenantId);
  }

  @Post()
  @RequirePermission(Permission.API_KEY_CREATE)
  create(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(tenantId, dto, actor.userId);
  }

  @Post(':id/revoke')
  @RequirePermission(Permission.API_KEY_DELETE)
  revoke(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.revoke(tenantId, id, actor.userId);
  }

  @Post(':id/rotate')
  @RequirePermission(Permission.API_KEY_CREATE)
  rotate(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.rotate(tenantId, id, actor.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.API_KEY_DELETE)
  delete(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.delete(tenantId, id, actor.userId);
  }
}
