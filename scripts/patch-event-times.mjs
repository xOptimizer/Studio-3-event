import dotenv from 'dotenv';
dotenv.config({ override: true });

import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from '../src/lib/resolve-database-url.js';
import { EVENT_DISPLAY } from '../src/constants/eventDisplay.js';

const databaseUrl = await resolveDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

const slug = process.env.EVENT_SLUG || 'inside-the-mind-2026';

const result = await prisma.event.updateMany({
  where: { slug },
  data: {
    startsAt: EVENT_DISPLAY.startsAt,
    endsAt: EVENT_DISPLAY.endsAt,
  },
});

console.log(`Updated ${result.count} event(s) for slug "${slug}"`);
console.log(`  startsAt: ${EVENT_DISPLAY.startsAt.toISOString()} (8:00 PM CDT)`);
console.log(`  endsAt:   ${EVENT_DISPLAY.endsAt.toISOString()} (12:00 AM CDT)`);

await prisma.$disconnect();
