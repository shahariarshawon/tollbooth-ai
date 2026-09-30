import type { NestExpressApplication } from '@nestjs/platform-express';
import { requestContextMiddleware } from './common/middleware/request-context.middleware';

/** Transport-level setup shared by the real server and the integration tests. */
export function configureApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.use(requestContextMiddleware);
  // Chat histories exceed Express default 100 kB limit easily.
  app.useBodyParser('json', { limit: '1mb' });
}
