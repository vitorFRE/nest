import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AllConfigType } from '../../config/config.type';
import { Role, User } from '../../generated/prisma/client';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');

describe('AuthService', () => {
  const password = 'a-valid-password1';
  const auth: AllConfigType['auth'] = {
    accessSecret: 'unit-access-secret-with-at-least-32-characters',
    refreshSecret: 'unit-refresh-secret-with-at-least-32-characters',
    accessExpiresIn: 900,
    refreshExpiresIn: 604800,
    allowRegistration: true,
  };
  const users = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };
  const sessions = {
    create: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeForUser: jest.fn(),
    revokeIfRefreshReuse: jest.fn(),
  };
  const jwt = new JwtService();
  let service: AuthService;
  let user: User;

  beforeEach(async () => {
    jest.resetAllMocks();
    user = {
      id: '18c01ca1-e110-44f9-9720-c865f7d49bfa',
      email: 'user@example.com',
      name: 'User',
      password: await bcrypt.hash(password, 4),
      role: Role.USER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.findByEmail.mockResolvedValue(user);
    users.findById.mockResolvedValue(user);
    users.create.mockResolvedValue(user);
    sessions.create.mockResolvedValue({ id: 'session-id' });
    sessions.rotateRefreshToken.mockResolvedValue(true);
    sessions.revokeForUser.mockResolvedValue(undefined);
    sessions.revokeIfRefreshReuse.mockResolvedValue('race');
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: SessionsService, useValue: sessions },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService<AllConfigType>({ auth: { ...auth } }),
        },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('should reject registration before querying the database when disabled', async () => {
    const config = new ConfigService<AllConfigType>({
      auth: { ...auth, allowRegistration: false },
    });
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: SessionsService, useValue: sessions },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    await expect(
      module.get(AuthService).register({ email: user.email, password }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findByEmail).not.toHaveBeenCalled();
  });

  it('should reject an existing registration without creating a session', async () => {
    await expect(
      service.register({ email: user.email, password }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.create).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('should hash a registered password and create a session with only a token hash', async () => {
    users.findByEmail.mockResolvedValue(null);
    const result = await service.register({ email: user.email, password });
    const created = users.create.mock.calls[0][0];
    expect(await bcrypt.compare(password, created.password)).toBe(true);
    expect(bcrypt.getRounds(created.password)).toBe(12);
    expect(sessions.create).toHaveBeenCalledWith(
      expect.any(String),
      user.id,
      digest(result.refreshToken),
      expect.any(Date),
    );
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('refreshToken');
  });

  it.each([
    ['missing user', null, password],
    ['disabled user', { isActive: false }, password],
    ['invalid password', {}, 'incorrect'],
  ])('should reject login with %s', async (_, changes, submittedPassword) => {
    users.findByEmail.mockResolvedValue(
      changes === null ? null : { ...user, ...changes },
    );
    await expect(
      service.login({ email: user.email, password: submittedPassword }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('should issue different access and refresh tokens tied to one session', async () => {
    const result = await service.login({ email: user.email, password });
    const access = jwt.verify<{
      type: string;
      sessionId: string;
      exp: number;
      iat: number;
    }>(result.accessToken, { secret: auth.accessSecret });
    const refresh = jwt.verify<{
      type: string;
      sessionId: string;
      exp: number;
      iat: number;
    }>(result.refreshToken, { secret: auth.refreshSecret });
    expect(access).toMatchObject({
      type: 'access',
      sessionId: refresh.sessionId,
    });
    expect(refresh.type).toBe('refresh');
    expect(access.exp - access.iat).toBe(auth.accessExpiresIn);
    expect(refresh.exp - refresh.iat).toBe(auth.refreshExpiresIn);
    expect(() =>
      jwt.verify(result.refreshToken, { secret: auth.accessSecret }),
    ).toThrow();
  });

  it.each([
    ['missing user', null],
    ['disabled user', { isActive: false }],
  ])('should reject refresh for a %s', async (_, refreshedUser) => {
    users.findById.mockResolvedValue(refreshedUser);
    await expect(
      service.refreshTokens(user.id, 'session-id', 'refresh-token'),
    ).resolves.toEqual({ status: 'rejected' });
    expect(sessions.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('should atomically rotate the full refresh token hash for its session', async () => {
    const result = await service.refreshTokens(
      user.id,
      'session-id',
      'refresh-token',
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(sessions.rotateRefreshToken).toHaveBeenCalledWith(
      'session-id',
      user.id,
      digest('refresh-token'),
      digest(result.refreshToken),
    );
  });

  it('should treat a concurrent refresh as a race without reuse revocation', async () => {
    sessions.rotateRefreshToken.mockResolvedValue(false);
    sessions.revokeIfRefreshReuse.mockResolvedValue('race');
    await expect(
      service.refreshTokens(user.id, 'session-id', 'refresh-token'),
    ).resolves.toEqual({ status: 'rejected' });
    expect(sessions.revokeIfRefreshReuse).toHaveBeenCalledWith(
      'session-id',
      user.id,
      digest('refresh-token'),
    );
  });

  it('should signal refresh token reuse after the grace window', async () => {
    sessions.rotateRefreshToken.mockResolvedValue(false);
    sessions.revokeIfRefreshReuse.mockResolvedValue('reuse');
    await expect(
      service.refreshTokens(user.id, 'session-id', 'refresh-token'),
    ).resolves.toEqual({ status: 'reuse', sessionId: 'session-id' });
  });

  it('should revoke only the requested session on logout', async () => {
    await service.logout(user.id, 'session-id');
    expect(sessions.revokeForUser).toHaveBeenCalledWith('session-id', user.id);
  });

  it.each([
    ['missing', null],
    ['disabled', { isActive: false }],
  ])('should reject the profile of a %s account', async (_, foundUser) => {
    users.findById.mockResolvedValue(foundUser);
    await expect(service.getMe(user.id)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('should return a profile without credential values', async () => {
    const result = await service.getMe(user.id);
    expect(result).toMatchObject({ id: user.id, email: user.email });
    expect(result).not.toHaveProperty('password');
  });
});
