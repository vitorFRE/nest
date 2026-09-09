import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AllConfigType } from '../../config/config.type';
import { UsersService } from '../../modules/users/users.service';
import { SessionsService } from '../../modules/sessions/sessions.service';
import { AuthRequest } from '../types/auth-request.type';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const secret = 'unit-access-secret-with-at-least-32-characters';
  const jwt = new JwtService();
  const reflector = { getAllAndOverride: jest.fn() };
  const users = { findById: jest.fn() };
  const sessions = { isActive: jest.fn() };
  let guard: JwtAuthGuard;
  let request: AuthRequest;
  let context: ExecutionContext;

  beforeEach(async () => {
    jest.resetAllMocks();
    request = { headers: {} } as AuthRequest;
    sessions.isActive.mockResolvedValue(true);
    context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: jest.fn(),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext;
    const module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: UsersService, useValue: users },
        { provide: SessionsService, useValue: sessions },
        { provide: Reflector, useValue: reflector },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService<AllConfigType>({
            auth: { accessSecret: secret },
          }),
        },
      ],
    }).compile();
    guard = module.get(JwtAuthGuard);
  });

  const access = () =>
    jwt.sign(
      {
        sub: 'user-id',
        type: 'access',
        role: 'ADMIN',
        email: 'old@example.com',
        sessionId: 'session-id',
      },
      { secret, expiresIn: 60 },
    );

  it('should allow public routes without querying authentication state', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('should deny protected routes without a token', async () => {
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('should reject refresh claims even when signed with the access secret', async () => {
    request.headers.authorization = `Bearer ${jwt.sign({ sub: 'user-id', type: 'refresh' }, { secret })}`;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findById).not.toHaveBeenCalled();
  });

  it.each([null, { id: 'user-id', isActive: false }])(
    'should reject missing or disabled accounts: %j',
    async (user) => {
      request.headers.authorization = `Bearer ${access()}`;
      users.findById.mockResolvedValue(user);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    },
  );

  it('should use current database identity and role instead of stale token claims', async () => {
    request.headers.authorization = `Bearer ${access()}`;
    users.findById.mockResolvedValue({
      id: 'user-id',
      email: 'new@example.com',
      role: 'USER',
      isActive: true,
      password: 'sensitive',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      sub: 'user-id',
      email: 'new@example.com',
      role: 'USER',
      type: 'access',
      sessionId: 'session-id',
    });
  });

  it('should reject an access token whose session has been revoked', async () => {
    request.headers.authorization = 'Bearer ' + access();
    users.findById.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: 'USER',
      isActive: true,
    });
    sessions.isActive.mockResolvedValue(false);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('should propagate database failures rather than misclassifying them as invalid JWTs', async () => {
    request.headers.authorization = `Bearer ${access()}`;
    const failure = new Error('Database offline');
    users.findById.mockRejectedValue(failure);
    await expect(guard.canActivate(context)).rejects.toBe(failure);
  });
});
