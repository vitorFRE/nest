import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/authorization/permission';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditService } from './audit.service';

@ApiTags('audit logs')
@ApiBearerAuth()
@Permissions(Permission.AUDIT_LOGS_READ)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditService.findAll(query);
  }
}
