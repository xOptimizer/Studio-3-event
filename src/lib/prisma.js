import dotenv from 'dotenv';
dotenv.config({ override: true });

import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './resolve-database-url.js';

const globalForPrisma = globalThis;

async function createPrismaClient() {
  const databaseUrl = await resolveDatabaseUrl(process.env.DATABASE_URL);

  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma || (await createPrismaClient());

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
