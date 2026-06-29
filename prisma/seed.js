import dotenv from 'dotenv';
dotenv.config({ override: true });

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { resolveDatabaseUrl } from '../src/lib/resolve-database-url.js';
import { EVENT_DISPLAY } from '../src/constants/eventDisplay.js';

const databaseUrl = await resolveDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

export async function cleanDatabase(client = prisma) {
  await client.scanLog.deleteMany();
  await client.ticket.deleteMany();
  await client.order.deleteMany();
  await client.passwordResetOtp.deleteMany();
  await client.user.deleteMany();
  await client.event.deleteMany();
}

export async function seedDatabase(client = prisma) {
  const event = await client.event.create({
    data: {
      slug: 'inside-the-mind-2026',
      title: 'Inside the Mind of an Artist',
      venue: 'Dec on Dragon',
      address: '1414 Dragon St, Dallas, TX 75207',
      startsAt: EVENT_DISPLAY.startsAt,
      endsAt: EVENT_DISPLAY.endsAt,
      priceCents: 4995,
      regularPriceCents: 9995,
      earlyBirdLimit: 55,
      currency: 'USD',
      capacity: 500,
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@studio3.dallas';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin-change-me';
  const adminName = process.env.ADMIN_NAME || 'Studio 3 Admin';

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await client.user.create({
    data: {
      email: adminEmail.toLowerCase(),
      passwordHash,
      name: adminName,
      role: UserRole.admin,
      mustChangePassword: false,
    },
  });

  console.log('Seeded event:', event.slug, `(early bird limit: ${event.earlyBirdLimit})`);
  console.log('Seeded admin:', adminEmail);

  return { event, adminEmail };
}

async function main() {
  const fresh = process.argv.includes('--fresh');

  if (fresh) {
    console.log('Wiping all data…');
    await cleanDatabase();
    console.log('Database cleared.');
  }

  await seedDatabase();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
