import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AllConfigType } from '../../../config/config.type';
import { AuthRequest } from '../../../common/types/auth-request.type';
import { JwtPayload } from '../../../common/types/jwt-payload.type';
import { bearerToken } from '../../../common/utils/bearer-token';

@Injectable()
export class JwtRefreshGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Refresh token não fornecido');
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow('auth.refreshSecret', {
          infer: true,
        }),
        algorithms: ['HS256'],
      });
      if (
        payload.type !== 'refresh' ||
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.sessionId !== 'string' ||
        !payload.sessionId
      )
        throw new Error('Invalid payload');
      request.user = { ...payload, refreshToken: token };
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
    return true;
  }
}
