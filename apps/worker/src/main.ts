import { NestFactory } from '@nestjs/core';
import { loadDotEnv, loadWorkerConfig } from '@tollbooth/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'production') loadDotEnv();
  const config = loadWorkerConfig();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}

void bootstrap();
