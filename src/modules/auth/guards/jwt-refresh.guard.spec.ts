import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AllConfigType } from '../../../config/config.type';
import { AuthRequest } from '../../../common/types/auth-request.type';
import { JwtRefreshGuard } from './jwt-refresh.guard';

describe('JwtRefreshGuard', () => {
  const secret = 'unit-refresh-secret-with-at-least-32-characters';
  const jwt = new JwtService();
  const guard = new JwtRefreshGuard(
    jwt,
    new ConfigService<AllConfigType>({ auth: { refreshSecret: secret } }),
  );
  let request: AuthRequest;
  let context: ExecutionContext;

  beforeEach(() => {
    request = { headers: {} } as AuthRequest;
    context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  });

  it.each([undefined, 'Basic token', 'Bearer', 'Bearer token extra'])(
    'should reject malformed authorization: %s',
    async (authorization) => {
      request.headers.authorization = authorization;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    },
  );

  it.each([
    { sub: 'user-id', type: 'access' },
    { sub: '', type: 'refresh' },
    { type: 'refresh' },
  ])('should reject invalid refresh claims: %j', async (payload) => {
    request.headers.authorization = `Bearer ${jwt.sign(payload, { secret })}`;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it.each(['expired', 'wrong secret'])(
    'should reject a token with %s',
    async (scenario) => {
      const token = jwt.sign(
        { sub: 'user-id', type: 'refresh' },
        {
          secret: scenario === 'wrong secret' ? 'another-secret' : secret,
          expiresIn: scenario === 'expired' ? -1 : 60,
        },
      );
      request.headers.authorization = `Bearer ${token}`;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('should attach the verified user and original token for rotation', async () => {
    const token = jwt.sign(
      {
        sub: 'user-id',
        type: 'refresh',
        role: 'USER',
        email: 'user@example.com',
      },
      { secret, expiresIn: 60 },
    );
    request.headers.authorization = `bearer ${token}`;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      sub: 'user-id',
      type: 'refresh',
      refreshToken: token,
    });
  });
});
