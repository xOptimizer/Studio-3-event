import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { resolveDatabaseUrl } from '../src/lib/resolve-database-url.js';

const databaseUrl = await resolveDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

async function main() {
  const event = await prisma.event.upsert({
    where: { slug: 'inside-the-mind-2026' },
    update: {},
    create: {
      slug: 'inside-the-mind-2026',
      title: 'Inside the Mind of an Artist',
      venue: 'Dec on Dragon',
      address: '1414 Dragon St, Dallas, TX 75207',
      startsAt: new Date('2026-07-26T01:00:00.000Z'),
      endsAt: new Date('2026-07-26T07:00:00.000Z'),
      priceCents: 4995,
      currency: 'USD',
      capacity: 500,
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@studio3.dallas';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin-change-me';
  const adminName = process.env.ADMIN_NAME || 'Studio 3 Admin';

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, name: adminName, role: UserRole.admin },
    create: {
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: UserRole.admin,
    },
  });

  console.log('Seeded event:', event.slug);
  console.log('Seeded admin:', adminEmail);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
