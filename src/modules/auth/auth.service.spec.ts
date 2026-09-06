import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AllConfigType } from '../../config/config.type';
import { User } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

type Claims = {
  sub: string;
  type: string;
  jti: string;
  exp: number;
  iat: number;
};
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let config: ConfigService<AllConfigType>;
  let user: User;
  let passwordHash: string;
  const password = 'a-valid-password';
  const jwt = new JwtService();
  const auth: AllConfigType['auth'] = {
    accessSecret: 'unit-access-secret-with-at-least-32-characters',
    refreshSecret: 'unit-refresh-secret-with-at-least-32-characters',
    accessExpiresIn: 900,
    refreshExpiresIn: 604800,
    allowRegistration: true,
  };
  const users: jest.Mocked<
    Pick<
      UsersService,
      | 'findByEmail'
      | 'findById'
      | 'create'
      | 'updateRefreshToken'
      | 'rotateRefreshToken'
    >
  > = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn(),
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 4);
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    user = {
      id: '18c01ca1-e110-44f9-9720-c865f7d49bfa',
      email: 'user@example.com',
      name: 'User',
      password: passwordHash,
      role: 'USER',
      isActive: true,
      refreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.findById.mockResolvedValue(user);
    users.findByEmail.mockResolvedValue(user);
    users.create.mockResolvedValue(user);
    users.updateRefreshToken.mockResolvedValue(user);
    users.rotateRefreshToken.mockResolvedValue(true);
    config = new ConfigService<AllConfigType>({ auth: { ...auth } });
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('should reject disabled registration before querying or creating users', async () => {
    config.set('auth', { ...auth, allowRegistration: false });
    await expect(
      service.register({ email: user.email, password }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
  });

  it('should reject an existing email without issuing a session', async () => {
    await expect(
      service.register({ email: user.email, password }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
    expect(users.updateRefreshToken).not.toHaveBeenCalled();
  });

  it('should hash registration passwords with cost 12 and return only public profile fields', async () => {
    users.findByEmail.mockResolvedValue(null);
    const result = await service.register({
      email: user.email,
      password,
      name: 'User',
    });
    const saved = users.create.mock.calls[0][0];
    expect(await bcrypt.compare(password, saved.password)).toBe(true);
    expect(bcrypt.getRounds(saved.password)).toBe(12);
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('refreshToken');
    expect(users.updateRefreshToken).toHaveBeenCalledWith(
      user.id,
      digest(result.refreshToken),
    );
  });

  it.each(['missing', 'inactive', 'wrong password'])(
    'should reject %s credentials without changing the session',
    async (scenario) => {
      if (scenario === 'missing') users.findByEmail.mockResolvedValue(null);
      if (scenario === 'inactive') user.isActive = false;
      await expect(
        service.login({
          email: user.email,
          password: scenario === 'wrong password' ? 'incorrect' : password,
        }),
      ).rejects.toThrow('Credenciais inválidas');
      expect(users.updateRefreshToken).not.toHaveBeenCalled();
    },
  );

  it('should sign distinct token kinds with separate secrets, expirations and random IDs', async () => {
    const result = await service.login({ email: user.email, password });
    const access = jwt.verify<Claims>(result.accessToken, {
      secret: auth.accessSecret,
    });
    const refresh = jwt.verify<Claims>(result.refreshToken, {
      secret: auth.refreshSecret,
    });
    expect(access).toMatchObject({ sub: user.id, type: 'access' });
    expect(refresh).toMatchObject({ sub: user.id, type: 'refresh' });
    expect(access.exp - access.iat).toBe(auth.accessExpiresIn);
    expect(refresh.exp - refresh.iat).toBe(auth.refreshExpiresIn);
    expect(access.jti).not.toBe(refresh.jti);
    expect(() =>
      jwt.verify(result.refreshToken, { secret: auth.accessSecret }),
    ).toThrow();
    const second = await service.login({ email: user.email, password });
    expect(second.refreshToken).not.toBe(result.refreshToken);
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('refreshToken');
  });

  it.each(['missing', 'inactive', 'revoked', 'different token'])(
    'should reject refresh for %s sessions',
    async (scenario) => {
      const token = 'old-token';
      user.refreshToken = digest(token);
      if (scenario === 'missing') users.findById.mockResolvedValue(null);
      if (scenario === 'inactive') user.isActive = false;
      if (scenario === 'revoked') user.refreshToken = null;
      await expect(
        service.refreshTokens(
          user.id,
          scenario === 'different token' ? 'another-token' : token,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.rotateRefreshToken).not.toHaveBeenCalled();
    },
  );

  it('should compare the entire refresh token beyond the bcrypt 72-byte boundary', async () => {
    const prefix = 'x'.repeat(100);
    user.refreshToken = digest(prefix + 'original');
    await expect(
      service.refreshTokens(user.id, prefix + 'tampered'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('should rotate using the previous digest and persist only the new digest', async () => {
    user.refreshToken = digest('old-token');
    const result = await service.refreshTokens(user.id, 'old-token');
    expect(users.rotateRefreshToken).toHaveBeenCalledWith(
      user.id,
      user.refreshToken,
      digest(result.refreshToken),
    );
    expect(users.updateRefreshToken).not.toHaveBeenCalled();
  });

  it('should reject a lost rotation race instead of returning unusable tokens', async () => {
    user.refreshToken = digest('old-token');
    users.rotateRefreshToken.mockResolvedValue(false);
    await expect(service.refreshTokens(user.id, 'old-token')).rejects.toThrow(
      'Refresh token já utilizado ou revogado',
    );
  });

  it('should propagate database failures instead of reporting invalid credentials', async () => {
    const failure = new Error('Database offline');
    users.findByEmail.mockRejectedValue(failure);
    await expect(service.login({ email: user.email, password })).rejects.toBe(
      failure,
    );
  });

  it('should not return a successful login when saving the refresh fails', async () => {
    const failure = new Error('Write failed');
    users.updateRefreshToken.mockRejectedValue(failure);
    await expect(service.login({ email: user.email, password })).rejects.toBe(
      failure,
    );
  });

  it.each(['missing', 'inactive'])(
    'should reject the profile of a %s user',
    async (scenario) => {
      if (scenario === 'missing') users.findById.mockResolvedValue(null);
      else user.isActive = false;
      await expect(service.getMe(user.id)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('should return a profile without credential hashes', async () => {
    user.refreshToken = digest('token');
    const profile = await service.getMe(user.id);
    expect(profile).toMatchObject({ id: user.id, email: user.email });
    expect(profile).not.toHaveProperty('password');
    expect(profile).not.toHaveProperty('refreshToken');
  });

  it('should revoke renewal on logout', async () => {
    await expect(service.logout(user.id)).resolves.toBeUndefined();
    expect(users.updateRefreshToken).toHaveBeenCalledWith(user.id, null);
  });
});
