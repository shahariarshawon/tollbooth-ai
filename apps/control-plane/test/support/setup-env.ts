import { loadDotEnv } from '@tollbooth/config';

// Local runs read the repository .env. CI provides real environment variables, which win.
loadDotEnv();

process.env['NODE_ENV'] = 'test';
process.env['PORT'] ??= '3001';
process.env['REDIS_URL'] ??= 'redis://localhost:6379';
process.env['KAFKA_BROKER'] ??= 'localhost:9094';
process.env['JWT_SECRET'] ??= 'e2e-only-secret-that-is-at-least-32-chars';
// Minimum allowed cost keeps the suite fast; production uses the configured default.
process.env['BCRYPT_ROUNDS'] = '10';

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL is required to run the e2e tests (see .env.example)');
}
