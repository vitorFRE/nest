import { buildConfig } from './configuration';

const env = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
};

describe('Configuration', () => {
  it('should parse defaults and false without implicit boolean coercion', () => {
    const config = buildConfig({ ...env, ALLOW_REGISTRATION: 'false' });
    expect(config.auth.allowRegistration).toBe(false);
    expect(config.auth.accessExpiresIn).toBe(900);
    expect(config.database.url).toBe('file:./dev.db');
  });

  it.each([
    { JWT_ACCESS_SECRET: '' },
    { JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET },
    { JWT_ACCESS_SECRET: 'change-me-access'.repeat(4) },
    { PORT: '3000oops' },
    { PORT: '0' },
    { NODE_ENV: 'prod' },
    { JWT_ACCESS_EXPIRES: '15' },
    { JWT_REFRESH_EXPIRES: '0s' },
    { ALLOW_REGISTRATION: 'yes' },
    { APP_CORS_ORIGINS: '*' },
    { APP_CORS_ORIGINS: 'https://example.com/path' },
    { LOCAL_DATABASE_URL: 'libsql://remote' },
    { TRUST_PROXY_HOPS: '-1' },
  ])('should reject invalid environment settings: %j', (overrides) => {
    expect(() => buildConfig({ ...env, ...overrides })).toThrow();
  });

  it('should require remote credentials in production and disable registration/docs by default', () => {
    expect(() => buildConfig({ ...env, NODE_ENV: 'production' })).toThrow();
    const config = buildConfig({
      ...env,
      NODE_ENV: 'production',
      DATABASE_URL: 'libsql://example.turso.io',
      DATABASE_AUTH_TOKEN: 'test-token',
    });
    expect(config.auth.allowRegistration).toBe(false);
    expect(config.app.swaggerEnabled).toBe(false);
    expect(config.database.url).toBe('libsql://example.turso.io');
  });
});
