import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Load .env if present
try {
  process.loadEnvFile?.(path.resolve(__dirname, '../../.env'));
} catch {}
try {
  process.loadEnvFile?.(path.resolve(process.cwd(), '.env'));
} catch {}

/**
 * Database seeding, split by who may run it where. Each target is named explicitly:
 *
 *   reference   providers, models, billing plans. Production-safe and idempotent; never overwrites.
 *   dev         a sample tenant with known passwords. Local development only.
 *   demo        the public demo workspace (generated sample data, no usable passwords). Needs
 *               `reference` first. Safe in production, and only ever touches its own tenant.
 *
 * `pnpm db:seed` runs reference and dev for local development. A production deploy runs `reference`,
 * and `demo` only where the demo is wanted (see docs/deployment.md). Targets load lazily, so running
 * `reference` never imports dev-only code or its dependencies.
 */
type Seeder = (prisma: PrismaClient) => Promise<void>;

const TARGETS: Record<string, () => Promise<Seeder>> = {
  reference: async () => (await import('./reference')).seedReferenceData,
  dev: async () => (await import('./dev')).seedDevData,
  demo: async () => (await import('./demo')).seedDemoData,
};

function createPgPool(connectionString: string): Pool {
  const isSupabase = connectionString.includes('supabase.com');
  if (isSupabase) {
    try {
      const url = new URL(connectionString);
      url.searchParams.delete('sslmode');
      return new Pool({
        connectionString: url.toString(),
        ssl: { rejectUnauthorized: false },
      });
    } catch {
      return new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
      });
    }
  }
  return new Pool({ connectionString });
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const unknown = requested.filter((name) => !(name in TARGETS));
  if (requested.length === 0 || unknown.length > 0) {
    throw new Error(
      `Usage: seed <${Object.keys(TARGETS).join('|')}>...` +
        (unknown.length > 0 ? ` (unknown: ${unknown.join(', ')})` : ''),
    );
  }

  if (requested.includes('dev') && process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'Refusing to seed development data (known passwords) with NODE_ENV=production.',
    );
  }

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in the environment or .env file.');
  }

  const pool = createPgPool(connectionString);
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    for (const name of requested) {
      const seed = await TARGETS[name]!();
      await seed(prisma);
    }
    console.log('Seed complete.');
  } finally {
    await prisma.$disconnect();
    await pool?.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
