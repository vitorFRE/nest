import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllConfigType } from './config/config.type';
import { configureApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const config = app
    .get(ConfigService<AllConfigType>)
    .getOrThrow('app', { infer: true });
  await app.listen(config.port);
  Logger.log(`${config.name} listening on port ${config.port}`, 'Bootstrap');
}
void bootstrap().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.message : 'Startup failed',
    undefined,
    'Bootstrap',
  );
  process.exitCode = 1;
});
