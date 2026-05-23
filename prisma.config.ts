import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import pg from 'pg';

// Load .env so DATABASE_URL is available when Prisma CLI reads this config
config();

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrate: {
    async adapter(datasourceUrl: string) {
      const pool = new pg.Pool({ connectionString: datasourceUrl });
      return new PrismaPg(pool);
    },
  },
});
