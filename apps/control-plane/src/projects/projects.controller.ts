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
import { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@RequirePermission(Permission.PROJECT_READ)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(@CurrentTenantId() tenantId: string) {
    return this.projectsService.list(tenantId);
  }

  @Post()
  @RequirePermission(Permission.PROJECT_MANAGE)
  create(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ): Promise<any> {
    return this.projectsService.create(tenantId, dto, actor.userId);
  }

  @Get(':id')
  getById(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.projectsService.getById(tenantId, id);
  }

  @Patch(':id')
  @RequirePermission(Permission.PROJECT_MANAGE)
  update(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<any> {
    return this.projectsService.update(tenantId, id, dto, actor.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.PROJECT_MANAGE)
  delete(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.projectsService.delete(tenantId, id, actor.userId);
  }

  @Get(':id/stats')
  getStats(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.projectsService.getStats(tenantId, id);
  }
}
