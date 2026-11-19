import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    if (!process.env['DATABASE_URL']) {
      try {
        process.loadEnvFile?.();
      } catch {}
    }

    const connectionString =
      process.env['DATABASE_URL'] || 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
    const pool = createPgPool(connectionString);
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}

