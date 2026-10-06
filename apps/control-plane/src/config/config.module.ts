import { Global, Module } from '@nestjs/common';
import { loadControlPlaneConfig } from '@tollbooth/config';
import type { ControlPlaneConfig } from '@tollbooth/config';

export const APP_CONFIG = Symbol('APP_CONFIG');
/** The control plane's validated environment. Aliased so the rest of the app names one `AppConfig`. */
export type AppConfig = ControlPlaneConfig;

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadControlPlaneConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
