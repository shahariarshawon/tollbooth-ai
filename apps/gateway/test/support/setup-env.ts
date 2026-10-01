import { loadDotEnv } from '@tollbooth/config';

// Local runs read the repository .env. CI provides real environment variables, which win.
loadDotEnv();

process.env['NODE_ENV'] = 'test';
process.env['PORT'] ??= '3000';
process.env['REDIS_URL'] ??= 'redis://localhost:6379';
process.env['KAFKA_BROKER'] ??= 'localhost:9094';
process.env['JWT_SECRET'] ??= 'e2e-only-secret-that-is-at-least-32-chars';

// The suite talks to a fake OpenAI server, never the real API, whatever the developer has configured.
process.env['OPENAI_API_KEY'] = 'sk-test-e2e-not-a-real-key';
process.env['GATEWAY_MAX_TOKENS'] = '4096';
process.env['GATEWAY_PROVIDER_TIMEOUT_MS'] = '1500';
// Small but non-zero, so retry tests can exhaust it (3 total attempts) without the suite getting slow.
process.env['GATEWAY_MAX_PROVIDER_RETRIES'] = '2';
// Small, so a test that makes the fake security service hang does not slow the suite down.
process.env['GATEWAY_SECURITY_TIMEOUT_MS'] = '500';
delete process.env['GATEWAY_PORT'];

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL is required to run the e2e tests (see .env.example)');
}
