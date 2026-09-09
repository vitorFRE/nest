import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditService } from './audit.service';

@ApiTags('audit logs')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditService.findAll(query);
  }
}
