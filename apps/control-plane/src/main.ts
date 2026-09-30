import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadConfig, loadDotEnv } from '@tollbooth/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'production') loadDotEnv();
  const config = loadConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}

void bootstrap();
