import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

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
  const pool = connectionString
    ? new Pool({
        connectionString,
        ssl: connectionString.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
      })
    : undefined;
  const adapter = pool ? new PrismaPg(pool) : undefined;
  const prisma = adapter ? new PrismaClient({ adapter }) : new PrismaClient();
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
