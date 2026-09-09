import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRequest } from '../types/auth-request.type';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
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
    'should allow a route without required roles: %j',
    (roles) => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
      expect(guard.canActivate(context)).toBe(true);
    },
  );

  it('should return 401 when roles are required but authentication is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should return 403 when the authenticated user lacks the required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    request.user = {
      sub: 'user-id',
      email: 'user@example.com',
      role: 'USER',
      type: 'access',
      sessionId: 'session-id',
    };
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow any role in the required list', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['ADMIN', 'USER']);
    request.user = {
      sub: 'user-id',
      email: 'user@example.com',
      role: 'USER',
      type: 'access',
      sessionId: 'session-id',
    };
    expect(guard.canActivate(context)).toBe(true);
  });
});
