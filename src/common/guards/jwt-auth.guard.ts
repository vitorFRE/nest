import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AllConfigType } from '../../config/config.type';
import { UsersService } from '../../modules/users/users.service';
import { SessionsService } from '../../modules/sessions/sessions.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthRequest } from '../types/auth-request.type';
import { JwtPayload } from '../types/jwt-payload.type';
import { bearerToken } from '../utils/bearer-token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Token não fornecido');
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow('auth.accessSecret', {
          infer: true,
        }),
        algorithms: ['HS256'],
      });
      if (
        payload.type !== 'access' ||
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.sessionId !== 'string' ||
        !payload.sessionId
      )
        throw new Error('Invalid payload');
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user?.isActive) throw new UnauthorizedException('Conta indisponível');
    if (!(await this.sessionsService.isActive(payload.sessionId, user.id))) {
      throw new UnauthorizedException('Sessão indisponível');
    }
    request.user = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
      sessionId: payload.sessionId,
    };
    return true;
  }
}
