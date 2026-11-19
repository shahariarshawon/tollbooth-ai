import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Ensure .env is loaded from the repository root (built-in to Node 20.6+)
try {
  process.loadEnvFile?.(path.resolve(__dirname, '.env'));
} catch {
  // Ignored if .env doesn't exist (e.g. production environments where env vars are already set)
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts reference dev',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});

