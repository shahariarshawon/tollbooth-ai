import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentTenantId } from '../common/decorators/request.decorators';
import { Permission } from '../roles/permission';
import { RequirePermission } from '../roles/permissions.decorator';
import { AuditService } from './audit.service';
import type { PaginatedAuditLogs } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('audit-logs')
@RequirePermission(Permission.VIEW_AUDIT_LOGS)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findMany(
    @CurrentTenantId() tenantId: string,
    @Query() query: AuditQueryDto,
  ): Promise<PaginatedAuditLogs> {
    return this.auditService.findMany(tenantId, query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  async exportCsv(
    @CurrentTenantId() tenantId: string,
    @Query() query: AuditQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.auditService.exportCsv(tenantId, query);
    res.attachment(`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
    res.status(200).send(csv);
  }
}
