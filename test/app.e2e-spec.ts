import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { AllConfigType } from '../src/config/config.type';

type Session = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
};

describe('API with real SQLite', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let config: ConfigService<AllConfigType>;
  let session: Session;
  const email = 'user@example.com';
  const password = 'a-strong-test-password';

  beforeAll(async () => {
    execFileSync(
      process.execPath,
      [resolve('scripts/prisma.mjs'), 'migrate', 'deploy'],
      {
        cwd: resolve(__dirname, '..'),
        env: process.env,
        stdio: 'pipe',
      },
    );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    config = app.get(ConfigService<AllConfigType>);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should serve public health checks and deny unauthenticated routes', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' });
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200, { status: 'ok', database: 'up' });
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401);
    expect(response.body).toMatchObject({
      statusCode: 401,
      path: '/api/auth/me',
    });
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
  });

  it('should reject extra privileges and passwords exceeding 72 UTF-8 bytes', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, role: 'ADMIN' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'é'.repeat(37) })
      .expect(400);
  });

  it('should register with normalized email and never expose credential hashes', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: '  USER@EXAMPLE.COM  ', password, name: 'Test User' })
      .expect(201);
    session = response.body as Session;
    expect(session.user).toMatchObject({ email, role: 'USER' });
    expect(session.user).not.toHaveProperty('password');
    expect(session.user).not.toHaveProperty('refreshToken');
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await bcrypt.compare(password, stored.password)).toBe(true);
    expect(stored.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.refreshToken).not.toBe(session.refreshToken);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password })
      .expect(409);
  });

  it('should return the profile and enforce roles from the database', async () => {
    const auth = `Bearer ${session.accessToken}`;
    const profile = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', auth)
      .expect(200);
    expect(profile.body).not.toHaveProperty('password');
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', auth)
      .expect(403);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: 'ADMIN' },
    });
    const users = await request(app.getHttpServer())
      .get('/api/users?page=1&limit=1')
      .set('Authorization', auth)
      .expect(200);
    expect(users.body.meta).toEqual({
      total: 1,
      page: 1,
      limit: 1,
      totalPages: 1,
    });
    expect(users.body.data[0]).not.toHaveProperty('password');
    expect(users.body.data[0]).not.toHaveProperty('refreshToken');
    await request(app.getHttpServer())
      .get('/api/users?limit=101')
      .set('Authorization', auth)
      .expect(400);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: 'USER' },
    });
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', auth)
      .expect(403);
  });

  it('should reject expired tokens, invalid signatures and tokens of the wrong kind', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.refreshToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    const jwt = new JwtService();
    const auth = config.getOrThrow('auth', { infer: true });
    const expired = jwt.sign(
      { sub: session.user.id, type: 'access' },
      { secret: auth.accessSecret, expiresIn: -1 },
    );
    const wrongType = jwt.sign(
      { sub: session.user.id, type: 'refresh' },
      { secret: auth.accessSecret },
    );
    const forged = jwt.sign(
      { sub: session.user.id, type: 'access' },
      { secret: 'invalid-key' },
    );
    for (const token of [expired, wrongType, forged, 'not-a-jwt']) {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
  });

  it('should invalidate the previous refresh token on login', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'wrong' })
      .expect(401);
    const previous = session.refreshToken;
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    session = response.body as Session;
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${previous}`)
      .expect(401);
  });

  it('should rotate refresh tokens only once even for concurrent requests', async () => {
    const previous = session.refreshToken;
    const responses = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Authorization', `Bearer ${previous}`),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    const tokens = responses.find((response) => response.status === 200)!
      .body as Session;
    expect(tokens.refreshToken).not.toBe(previous);
    session = { ...session, ...tokens };
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${previous}`)
      .expect(401);
  });

  it('should block disabled accounts for access, login and refresh', async () => {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${session.refreshToken}`)
      .expect(401);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { isActive: true },
    });
  });

  it('should revoke refresh on logout and reject deleted users', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${session.refreshToken}`)
      .expect(401);
    await prisma.user.delete({ where: { id: session.user.id } });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
  });

  it('should honor the registration switch even outside production', async () => {
    config.set('auth', {
      ...config.getOrThrow('auth', { infer: true }),
      allowRegistration: false,
    });
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(403);
    config.set('auth', {
      ...config.getOrThrow('auth', { infer: true }),
      allowRegistration: true,
    });
  });

  it('should expose OpenAPI, security headers and explicit CORS origins', async () => {
    const docs = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(docs.body.paths).toHaveProperty('/api/auth/login');
    const allowed = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    const denied = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should rate limit repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 11; index++) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password });
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });
});
