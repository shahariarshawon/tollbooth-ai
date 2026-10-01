/**
 * k6 load test for the Tollbooth AI Gateway.
 *
 * Prerequisites:
 *   - k6 installed: https://k6.io/docs/get-started/installation/
 *   - Gateway running on K6_BASE_URL (default http://localhost:3000)
 *   - A valid API key set in K6_API_KEY
 *
 * Run:
 *   k6 run k6/load-test.js
 *   k6 run --env K6_BASE_URL=http://localhost:3000 --env K6_API_KEY=tb_... k6/load-test.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.K6_BASE_URL || 'http://localhost:3000';
const apiKey = __ENV.K6_API_KEY || '';

// Custom metrics
const aiRequestErrors = new Counter('ai_request_errors');
const aiRequestSuccess = new Counter('ai_request_success');
const aiErrorRate = new Rate('ai_error_rate');
const aiLatency = new Trend('ai_latency_ms', true);

export const options = {
  scenarios: {
    // Ramp up to 50 VUs over 15s, hold for 30s, ramp down
    sustained_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 },
        { duration: '30s', target: 50 },
        { duration: '10s', target: 100 },
        { duration: '15s', target: 100 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    // 95th percentile latency < 5s
    ai_latency_ms: ['p(95)<5000'],
    // Error rate < 5%
    ai_error_rate: ['rate<0.05'],
    // HTTP error rate < 5%
    http_req_failed: ['rate<0.05'],
  },
};

const payload = JSON.stringify({
  model: 'gemini-2.0-flash',
  messages: [
    { role: 'user', content: 'Say "load test ok" in exactly three words.' },
  ],
  max_tokens: 20,
});

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${apiKey}`,
};

export default function () {
  const res = http.post(`${baseUrl}/v1/chat/completions`, payload, {
    headers,
    timeout: '10s',
  });

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'has choices': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.choices) && body.choices.length > 0;
      } catch {
        return false;
      }
    },
    'has usage': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.usage?.total_tokens === 'number';
      } catch {
        return false;
      }
    },
  });

  aiLatency.add(res.timings.duration);

  if (success) {
    aiRequestSuccess.add(1);
    aiErrorRate.add(false);
  } else {
    aiRequestErrors.add(1);
    aiErrorRate.add(true);
  }

  sleep(0.5);
}

export function handleSummary(data) {
  return {
    stdout: buildSummary(data),
  };
}

function buildSummary(data) {
  const p50 = data.metrics.ai_latency_ms?.values?.['p(50)'] ?? 0;
  const p95 = data.metrics.ai_latency_ms?.values?.['p(95)'] ?? 0;
  const errorRate = (data.metrics.ai_error_rate?.values?.rate ?? 0) * 100;
  const total = data.metrics.ai_request_success?.values?.count ?? 0;
  const errors = data.metrics.ai_request_errors?.values?.count ?? 0;

  return [
    '\n=== Tollbooth AI Gateway Load Test ===',
    `Total requests: ${total + errors}`,
    `Successful:     ${total}`,
    `Errors:         ${errors} (${errorRate.toFixed(1)}%)`,
    `Latency p50:    ${p50.toFixed(0)} ms`,
    `Latency p95:    ${p95.toFixed(0)} ms`,
    '======================================\n',
  ].join('\n');
}
