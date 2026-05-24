import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const tasks = await prisma.task.findMany({ 
    where: { name: { contains: "Shadowing" } }
  });
  fs.writeFileSync('shadowing_tasks.json', JSON.stringify(tasks, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
