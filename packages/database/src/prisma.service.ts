import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool?: Pool;

  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (connectionString) {
      const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
      });
      const adapter = new PrismaPg(pool);
      super({ adapter });
      this.pool = pool;
    } else {
      super();
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool?.end();
  }
}

