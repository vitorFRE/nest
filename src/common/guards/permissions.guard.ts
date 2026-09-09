import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermissions } from '../authorization/role-permissions';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthRequest } from '../types/auth-request.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permissions?.length) return true;
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user) throw new UnauthorizedException();
    if (!hasPermissions(user.role, permissions)) {
      throw new ForbiddenException('Permissão insuficiente');
    }
    return true;
  }
}
