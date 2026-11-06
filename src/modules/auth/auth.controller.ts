import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuditAction } from '../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthRequest } from '../../common/types/auth-request.type';
import { JwtPayloadWithRefresh } from '../../common/types/jwt-payload.type';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @ApiBearerAuth('refresh-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @CurrentUser() user: JwtPayloadWithRefresh,
    @Req() request: AuthRequest,
  ) {
    const result = await this.authService.refreshTokens(
      user.sub,
      user.sessionId,
      user.refreshToken,
    );
    if (result.status === 'ok') {
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    }
    if (result.status === 'reuse') {
      await this.auditService.write({
        action: AuditAction.SESSION_REVOKED,
        actorUserId: user.sub,
        targetType: 'Session',
        targetId: result.sessionId,
        ipAddress: request.ip,
        requestId: request.requestId,
        metadata: { reason: 'refresh_reuse' },
      });
    }
    throw new UnauthorizedException('Refresh token já utilizado ou revogado');
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser('sub') userId: string) {
    return this.authService.getMe(userId);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@CurrentUser() user: JwtPayloadWithRefresh) {
    return this.authService.logout(user.sub, user.sessionId);
  }
}
