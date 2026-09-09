import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AllConfigType } from '../../config/config.type';
import { User } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { toUserProfile } from '../users/user-profile';
import { SessionsService } from '../sessions/sessions.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

// Refresh JWTs are high-entropy credentials. Hash the entire token, without bcrypt's 72-byte truncation.
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async register(dto: RegisterDto) {
    if (
      !this.configService.getOrThrow('auth.allowRegistration', { infer: true })
    ) {
      throw new ForbiddenException('Registro desabilitado');
    }
    if (await this.usersService.findByEmail(dto.email))
      throw new ConflictException('Email já está em uso');
    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: await bcrypt.hash(dto.password, 12),
    });
    return this.createSession(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (
      !user?.isActive ||
      !(await bcrypt.compare(dto.password, user.password))
    ) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.createSession(user);
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.sessionsService.revokeForUser(sessionId, userId);
  }

  async refreshTokens(userId: string, sessionId: string, token: string) {
    const user = await this.usersService.findById(userId);
    const previous = tokenHash(token);
    if (!user?.isActive) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    const tokens = await this.generateTokens(user, sessionId);
    if (
      !(await this.sessionsService.rotateRefreshToken(
        sessionId,
        user.id,
        previous,
        tokenHash(tokens.refreshToken),
      ))
    ) {
      throw new UnauthorizedException('Refresh token já utilizado ou revogado');
    }
    return tokens;
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user?.isActive) throw new UnauthorizedException();
    return toUserProfile(user);
  }

  private async createSession(user: User) {
    const sessionId = randomUUID();
    const tokens = await this.generateTokens(user, sessionId);
    const config = this.configService.getOrThrow('auth', { infer: true });
    await this.sessionsService.create(
      sessionId,
      user.id,
      tokenHash(tokens.refreshToken),
      new Date(Date.now() + config.refreshExpiresIn * 1000),
    );
    return { ...tokens, user: toUserProfile(user) };
  }

  private async generateTokens(user: User, sessionId: string) {
    const config = this.configService.getOrThrow('auth', { infer: true });
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, type: 'access' },
        {
          secret: config.accessSecret,
          expiresIn: config.accessExpiresIn,
          algorithm: 'HS256',
          jwtid: randomUUID(),
        },
      ),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: config.refreshSecret,
          expiresIn: config.refreshExpiresIn,
          algorithm: 'HS256',
          jwtid: randomUUID(),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
