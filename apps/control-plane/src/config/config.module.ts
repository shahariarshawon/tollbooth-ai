import { Global, Module } from '@nestjs/common';
import { loadConfig } from '@tollbooth/config';
import type { AppConfig } from '@tollbooth/config';

export const APP_CONFIG = Symbol('APP_CONFIG');
export type { AppConfig };

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
