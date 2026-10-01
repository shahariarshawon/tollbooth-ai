import { Counter, Histogram, collectDefaultMetrics, register } from 'prom-client';

collectDefaultMetrics();

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const aiRequestsTotal = new Counter({
  name: 'ai_requests_total',
  help: 'Total AI provider requests',
  labelNames: ['provider', 'model', 'status'] as const,
});

export const aiProviderErrorsTotal = new Counter({
  name: 'ai_provider_errors_total',
  help: 'Total AI provider errors',
  labelNames: ['provider', 'error_kind'] as const,
});

export const aiRequestLatency = new Histogram({
  name: 'ai_request_latency_seconds',
  help: 'AI request latency in seconds',
  labelNames: ['provider', 'model'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

export const tokensUsedTotal = new Counter({
  name: 'tokens_used_total',
  help: 'Total tokens used',
  labelNames: ['provider', 'model', 'type'] as const,
});

export const costTotalUsd = new Counter({
  name: 'cost_total_usd',
  help: 'Total AI cost in USD',
  labelNames: ['provider', 'model'] as const,
});

export { register as metricsRegistry };

export function recordAiSuccess(
  provider: string,
  model: string,
  tokens: { request: number; response: number },
  costUsd: string,
  latencyMs: number,
): void {
  aiRequestsTotal.inc({ provider, model, status: 'success' });
  aiRequestLatency.observe({ provider, model }, latencyMs / 1000);
  tokensUsedTotal.inc({ provider, model, type: 'request' }, tokens.request);
  tokensUsedTotal.inc({ provider, model, type: 'response' }, tokens.response);
  const cost = parseFloat(costUsd);
  if (cost > 0) costTotalUsd.inc({ provider, model }, cost);
}

export function recordAiFailure(provider: string, model: string, errorKind: string): void {
  aiRequestsTotal.inc({ provider, model, status: 'failure' });
  if (errorKind !== 'bad_request') {
    aiProviderErrorsTotal.inc({ provider, error_kind: errorKind });
  }
}
