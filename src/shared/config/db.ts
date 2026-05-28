// In ESM ("type":"module") all static imports are hoisted and evaluated before
// any code in server.ts runs, so dotenv.config() there fires AFTER this module
// is already evaluated. Load dotenv here so DATABASE_URL is set before the pool.
import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter } as any);
