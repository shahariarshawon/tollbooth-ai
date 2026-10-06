import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadDotEnv, loadGatewayConfig } from '@tollbooth/config';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'production') loadDotEnv();
  const config = loadGatewayConfig();

  // The JSON body parser is registered in configureApp so its size limit can be set.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}

void bootstrap();
