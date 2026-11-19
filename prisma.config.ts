import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts reference dev',
  },
  datasource: {
    url: process.env['DATABASE_URL'] || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
