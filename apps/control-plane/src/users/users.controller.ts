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
import { ClientIp, CurrentTenantId, CurrentUser } from '../common/decorators/request.decorators';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { Page } from '../common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponse } from './user.select';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission(Permission.USER_READ)
  list(
    @CurrentTenantId() tenantId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Page<UserResponse>> {
    return this.users.list(tenantId, query.limit, query.offset);
  }

  @Get(':id')
  @RequirePermission(Permission.USER_READ)
  get(
    @CurrentTenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponse> {
    return this.users.get(tenantId, id);
  }

  @Post()
  @RequirePermission(Permission.USER_CREATE)
  create(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateUserDto,
    @ClientIp() ip?: string,
  ): Promise<UserResponse> {
    return this.users.create(tenantId, actor, dto, ip);
  }

  @Patch(':id')
  @RequirePermission(Permission.USER_UPDATE)
  update(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @ClientIp() ip?: string,
  ): Promise<UserResponse> {
    return this.users.update(tenantId, actor, id, dto, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.USER_DELETE)
  remove(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip?: string,
  ): Promise<void> {
    return this.users.remove(tenantId, actor, id, ip);
  }
}
