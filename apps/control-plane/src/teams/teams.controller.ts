import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentTenantId, CurrentUser } from '../common/decorators/request.decorators';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from './dto/teams.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@RequirePermission(Permission.TEAM_READ)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  list(@CurrentTenantId() tenantId: string) {
    return this.teamsService.list(tenantId);
  }

  @Post()
  @RequirePermission(Permission.TEAM_MANAGE)
  create(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.create(tenantId, dto, actor.userId);
  }

  @Get(':id')
  getById(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.teamsService.getById(tenantId, id);
  }

  @Patch(':id')
  @RequirePermission(Permission.TEAM_MANAGE)
  update(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(tenantId, id, dto, actor.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TEAM_MANAGE)
  delete(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.teamsService.delete(tenantId, id, actor.userId);
  }

  @Post(':id/members')
  @RequirePermission(Permission.TEAM_MANAGE)
  addMember(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.teamsService.addMember(tenantId, id, dto, actor.userId);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TEAM_MANAGE)
  removeMember(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.teamsService.removeMember(tenantId, id, userId, actor.userId);
  }
}
