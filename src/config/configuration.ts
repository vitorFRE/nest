import { AllConfigType } from './config.type';

type Environment = Record<string, string | undefined>;

function integer(value: string, key: string, min: number, max: number): number {
  const parsed = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new Error(`${key} deve ser um inteiro entre ${min} e ${max}`);
  }
  return parsed;
}

function boolean(
  value: string | undefined,
  fallback: boolean,
  key: string,
): boolean {
  if (value === undefined) return fallback;
  if (value !== 'true' && value !== 'false')
    throw new Error(`${key} deve ser true ou false`);
  return value === 'true';
}

function duration(value: string, key: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) throw new Error(`${key} deve usar uma duração como 15m ou 7d`);
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return integer(String(Number(match[1]) * units[match[2]]), key, 1, 31536000);
}

function secret(env: Environment, key: string): string {
  const value = env[key];
  if (
    !value ||
    value.trim().length < 32 ||
    /change[-_ ]?me|your[-_ ]|replace[-_ ]/i.test(value)
  ) {
    throw new Error(
      `${key} deve conter um segredo próprio de pelo menos 32 caracteres`,
    );
  }
  return value;
}

export function buildConfig(env: Environment): AllConfigType {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    nodeEnv !== 'production'
  ) {
    throw new Error('NODE_ENV deve ser development, test ou production');
  }
  const production = nodeEnv === 'production';
  const accessSecret = secret(env, 'JWT_ACCESS_SECRET');
  const refreshSecret = secret(env, 'JWT_REFRESH_SECRET');
  if (accessSecret === refreshSecret)
    throw new Error('Os segredos de access e refresh devem ser diferentes');

  const corsOrigins = (
    env.APP_CORS_ORIGINS ??
    env.FRONTEND_URL ??
    'http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    !corsOrigins.length ||
    corsOrigins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          !['http:', 'https:'].includes(url.protocol) || url.origin !== origin
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      'APP_CORS_ORIGINS deve conter origens HTTP(S) explícitas, separadas por vírgula',
    );

  const apiPrefix = env.API_PREFIX ?? 'api';
  if (!/^[a-zA-Z0-9_-]+$/.test(apiPrefix))
    throw new Error('API_PREFIX deve ser um único segmento sem barras');
  const url = production
    ? env.DATABASE_URL
    : (env.LOCAL_DATABASE_URL ?? 'file:./dev.db');
  if (production) {
    if (
      !url ||
      !/^libsql:\/\/[^\s/]+\/?$/.test(url) ||
      !env.DATABASE_AUTH_TOKEN?.trim()
    ) {
      throw new Error(
        'Produção requer DATABASE_URL (libsql://...) e DATABASE_AUTH_TOKEN',
      );
    }
  } else if (!url?.startsWith('file:') || url.length <= 5) {
    throw new Error(
      'LOCAL_DATABASE_URL deve apontar para um SQLite local (file:...)',
    );
  }

  return {
    app: {
      nodeEnv,
      name: env.APP_NAME?.trim() || 'Nest Template API',
      port: integer(env.PORT ?? '3000', 'PORT', 1, 65535),
      apiPrefix,
      corsOrigins,
      swaggerEnabled: boolean(
        env.SWAGGER_ENABLED,
        !production,
        'SWAGGER_ENABLED',
      ),
      trustProxyHops: integer(
        env.TRUST_PROXY_HOPS ?? '0',
        'TRUST_PROXY_HOPS',
        0,
        10,
      ),
    },
    database: {
      url: url!,
      authToken: production ? env.DATABASE_AUTH_TOKEN : undefined,
    },
    auth: {
      accessSecret,
      refreshSecret,
      accessExpiresIn: duration(
        env.JWT_ACCESS_EXPIRES ?? '15m',
        'JWT_ACCESS_EXPIRES',
      ),
      refreshExpiresIn: duration(
        env.JWT_REFRESH_EXPIRES ?? '7d',
        'JWT_REFRESH_EXPIRES',
      ),
      allowRegistration: boolean(
        env.ALLOW_REGISTRATION,
        !production,
        'ALLOW_REGISTRATION',
      ),
    },
  };
}

export default () => buildConfig(process.env);
