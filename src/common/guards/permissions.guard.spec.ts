import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../authorization/permission';
import { AuthRequest } from '../types/auth-request.type';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);
  let request: AuthRequest;
  let context: ExecutionContext;

  beforeEach(() => {
    jest.restoreAllMocks();
    request = { headers: {} } as AuthRequest;
    context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: jest.fn(),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext;
  });

  it.each([undefined, []])(
    'should allow routes without required permissions: %j',
    (permissions) => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(permissions);
      expect(guard.canActivate(context)).toBe(true);
    },
  );

  it('should return 401 when a protected route has no authenticated user', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.USERS_READ]);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should return 403 when the role lacks one required permission', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.USERS_MANAGE]);
    request.user = {
      sub: 'user-id',
      email: 'support@example.com',
      role: 'SUPPORT',
      type: 'access',
      sessionId: 'session-id',
    };
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow a role that receives every required permission', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([
        Permission.USERS_READ,
        Permission.USERS_MANAGE,
        Permission.AUDIT_LOGS_READ,
      ]);
    request.user = {
      sub: 'user-id',
      email: 'admin@example.com',
      role: 'ADMIN',
      type: 'access',
      sessionId: 'session-id',
    };
    expect(guard.canActivate(context)).toBe(true);
  });
});
