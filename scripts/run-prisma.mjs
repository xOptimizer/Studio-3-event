import 'dotenv/config';
import { spawn } from 'node:child_process';
import { resolveDatabaseUrl } from '../src/lib/resolve-database-url.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/run-prisma.mjs <prisma-command> [...args]');
  process.exit(1);
}

const databaseUrl = await resolveDatabaseUrl(process.env.DATABASE_URL);

if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const child = spawn('npx', ['prisma', ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
