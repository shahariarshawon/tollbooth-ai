import { Inject, Injectable } from '@nestjs/common';
import { GatewayException } from '../common/errors/gateway.exception';
import { TrafficControlUnavailableException } from '../common/errors/traffic.exceptions';
import { logEvent } from '../common/logging/structured-logger';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';

/**
 * Decides what a Redis failure means for a request.
 *
 * Rate limits, token quotas and budgets exist to protect money and capacity, so by default a request
 * that cannot be checked is refused (fail closed, 503). With GATEWAY_FAIL_OPEN=true it is allowed
 * through instead, favouring availability. Rejections that the controls themselves raise (429, 402)
 * are real answers and always pass straight through.
 */
@Injectable()
export class RedisFailurePolicy {
  readonly failOpen: boolean;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.failOpen = config.GATEWAY_FAIL_OPEN;
  }

  /**
   * Runs `operation`. If Redis fails, returns `bypass` when failing open, otherwise throws a 503.
   * `bypass` is what the caller should treat as "no limit applied".
   */
  async guard<T>(control: string, operation: () => Promise<T>, bypass: T): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GatewayException) throw error;
      logEvent(
        {
          event: 'traffic_control_redis_failure',
          control,
          failOpen: this.failOpen,
          message: error instanceof Error ? error.message : 'unknown error',
        },
        'error',
      );
      if (this.failOpen) return bypass;
      throw new TrafficControlUnavailableException();
    }
  }
}
