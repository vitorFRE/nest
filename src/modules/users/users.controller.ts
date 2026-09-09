import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/authorization/permission';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditAction } from '../../generated/prisma/enums';
import { UsersService } from './users.service';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { AuthRequest } from '../../common/types/auth-request.type';
import { AuditService } from '../audit/audit.service';

@ApiTags('users')
@ApiBearerAuth()
@Permissions(Permission.USERS_READ)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findByIdSafe(id);
  }

  @Patch(':id')
  @Permissions(Permission.USERS_MANAGE)
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserAdminDto,
    @CurrentUser() actor: JwtPayload,
    @Req() request: AuthRequest,
  ) {
    if (dto.role === undefined && dto.isActive === undefined) {
      throw new BadRequestException('Informe role ou isActive');
    }
    const user = await this.usersService.updateAdmin(id, dto);
    const context = {
      actorUserId: actor.sub,
      targetType: 'User',
      targetId: id,
      ipAddress: request.ip,
      requestId: request.requestId,
    };
    if (dto.role !== undefined) {
      await this.auditService.write({
        ...context,
        action: AuditAction.USER_ROLE_UPDATED,
        metadata: { role: dto.role },
      });
    }
    if (dto.isActive !== undefined) {
      await this.auditService.write({
        ...context,
        action: AuditAction.USER_STATUS_UPDATED,
        metadata: { isActive: dto.isActive },
      });
    }
    return user;
  }
}
