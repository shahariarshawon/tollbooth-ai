import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { KAFKA_MODULE_OPTIONS, KafkaService } from './kafka.service';
import type { KafkaModuleOptions } from './kafka.service';

export interface KafkaModuleAsyncOptions {
  useFactory: () => KafkaModuleOptions | Promise<KafkaModuleOptions>;
}

/**
 * `KafkaModule.forRoot({ clientId, brokers })` (or `.forRootAsync`) once per app (the gateway imports it
 * where it publishes, the worker where it consumes). Each import gets its own `KafkaService` and its own
 * connection: the two apps are never meant to share one, so this is a plain dynamic module, not
 * `@Global()`.
 */
@Module({})
export class KafkaModule {
  static forRoot(options: KafkaModuleOptions): DynamicModule {
    return {
      module: KafkaModule,
      providers: [{ provide: KAFKA_MODULE_OPTIONS, useValue: options }, KafkaService],
      exports: [KafkaService],
    };
  }

  /**
   * Reads its options from a factory invoked when Nest builds the provider, not when the module is
   * declared. Use this (over `forRoot`) whenever the options come from `loadConfig()` or anything else
   * that depends on `.env` being loaded first: a plain object passed to `forRoot` is built while the
   * `imports: [...]` array is being evaluated, which happens as soon as the module file is imported —
   * before an app's `bootstrap()` function has had a chance to call `loadDotEnv()`.
   */
  static forRootAsync(options: KafkaModuleAsyncOptions): DynamicModule {
    return {
      module: KafkaModule,
      providers: [{ provide: KAFKA_MODULE_OPTIONS, useFactory: options.useFactory }, KafkaService],
      exports: [KafkaService],
    };
  }
}
