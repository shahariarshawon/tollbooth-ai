import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadControlPlaneConfig, loadDotEnv } from '@tollbooth/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'production') loadDotEnv();
  const config = loadControlPlaneConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  // Only trust X-Forwarded-For from as many proxies as there really are; see TRUST_PROXY_HOPS.
  if (config.TRUST_PROXY_HOPS > 0) app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}

void bootstrap();
