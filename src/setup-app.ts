import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { AllConfigType } from './config/config.type';
import { validationOptions } from './common/utils/validation-options';

export function configureApp(app: NestExpressApplication) {
  const config = app
    .get(ConfigService<AllConfigType>)
    .getOrThrow('app', { infer: true });
  const logger = new Logger('HTTP');
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    const startedAt = performance.now();
    res.on('finish', () =>
      logger.log({
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
    next();
  });
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.setGlobalPrefix(config.apiPrefix, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
  if (config.swaggerEnabled) {
    const options = new DocumentBuilder()
      .setTitle(config.name)
      .setVersion('1.0')
      .setDescription(
        'Autenticação JWT: access token nas rotas protegidas; refresh token apenas em /auth/refresh.',
      )
      .addBearerAuth()
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Refresh token',
        },
        'refresh-token',
      )
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, options),
      {
        swaggerOptions: { persistAuthorization: false },
      },
    );
  }
}
