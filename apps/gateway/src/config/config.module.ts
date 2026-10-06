import { Global, Module } from '@nestjs/common';
import { loadGatewayConfig } from '@tollbooth/config';
import type { GatewayConfig } from '@tollbooth/config';

export const APP_CONFIG = Symbol('APP_CONFIG');
/** The gateway's validated environment. Aliased so the rest of the app names one `AppConfig`. */
export type AppConfig = GatewayConfig;

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadGatewayConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
