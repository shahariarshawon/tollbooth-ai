import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientIp, CurrentUser } from '../common/decorators/request.decorators';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { Page } from '../common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { TenantsService } from './tenants.service';
import type { TenantResponse } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @RequirePermission(Permission.TENANT_MANAGE)
  list(@Query() query: PaginationQueryDto): Promise<Page<TenantResponse>> {
    return this.tenants.list(query.limit, query.offset);
  }

  @Post()
  @RequirePermission(Permission.TENANT_MANAGE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateTenantDto,
    @ClientIp() ip?: string,
  ): Promise<TenantResponse> {
    return this.tenants.create(actor, dto, ip);
  }

  // No permission needed: any authenticated user may read their own tenant. The service enforces it.
  @Get(':id')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TenantResponse> {
    return this.tenants.get(actor, id);
  }

  @Patch(':id')
  @RequirePermission(Permission.MANAGE_SETTINGS)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @ClientIp() ip?: string,
  ): Promise<TenantResponse> {
    return this.tenants.update(actor, id, dto, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TENANT_MANAGE)
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip?: string,
  ): Promise<void> {
    return this.tenants.remove(actor, id, ip);
  }
}
