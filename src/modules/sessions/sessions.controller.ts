import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthRequest } from '../../common/types/auth-request.type';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: JwtPayload) {
    const sessions = await this.sessionsService.findAllForUser(user.sub);
    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === user.sessionId,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: AuthRequest,
  ): Promise<void> {
    await this.sessionsService.revokeForUser(id, user.sub);
    await this.auditService.write({
      action: AuditAction.SESSION_REVOKED,
      actorUserId: user.sub,
      targetType: 'Session',
      targetId: id,
      ipAddress: request.ip,
      requestId: request.requestId,
      metadata: { currentSession: id === user.sessionId },
    });
  }
}
