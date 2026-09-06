const databaseFile = process.env.TEST_DATABASE_FILE;
if (!databaseFile)
  throw new Error(
    'Execute os testes com pnpm test:e2e para usar um banco isolado.',
  );
Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-access-secret-with-more-than-32-characters',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-more-than-32-characters',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
  LOCAL_DATABASE_URL: `file:${databaseFile.replace(/\\/g, '/')}`,
  PORT: '3000',
  API_PREFIX: 'api',
  ALLOW_REGISTRATION: 'true',
  SWAGGER_ENABLED: 'true',
  APP_CORS_ORIGINS: 'http://localhost:5173',
  TRUST_PROXY_HOPS: '0',
});
