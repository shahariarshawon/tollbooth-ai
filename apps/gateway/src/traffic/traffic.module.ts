import { Module } from '@nestjs/common';
import { BudgetGuard } from '../budget/budget.guard';
import { BudgetService } from '../budget/budget.service';
import { CIRCUIT_OPTIONS, CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import type { CircuitBreakerOptions } from '../circuit-breaker/circuit-breaker.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';
import { DEFAULT_PLAN_LIMITS, PLAN_LIMITS, TrafficLimits } from './plan-limits';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimiterService } from './rate-limiter.service';
import { TokenQuotaService } from './token-quota.service';
import { TrafficControlService } from './traffic-control.service';
import { WindowCounter } from './window-counter';

@Module({
  providers: [
    { provide: PLAN_LIMITS, useValue: DEFAULT_PLAN_LIMITS },
    {
      provide: CIRCUIT_OPTIONS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): CircuitBreakerOptions => ({
        failureThreshold: config.GATEWAY_CIRCUIT_FAILURE_THRESHOLD,
        openMs: config.GATEWAY_CIRCUIT_OPEN_MS,
        failureWindowMs: 60_000,
        successesToClose: 2,
        // A trial call that never reports back (the gateway crashed mid-call) frees its slot once the
        // provider timeout has certainly passed.
        probeTimeoutMs: config.GATEWAY_PROVIDER_TIMEOUT_MS + 5_000,
      }),
    },
    TrafficLimits,
    WindowCounter,
    RateLimiterService,
    TokenQuotaService,
    BudgetService,
    CircuitBreakerService,
    TrafficControlService,
    RateLimitGuard,
    BudgetGuard,
  ],
  // Guards named in @UseGuards are built inside the consuming module, so what they depend on
  // (RateLimiterService, BudgetService, TrafficLimits) has to be exported alongside them.
  exports: [
    RateLimitGuard,
    BudgetGuard,
    RateLimiterService,
    BudgetService,
    TrafficLimits,
    TrafficControlService,
  ],
})
export class TrafficModule {}
