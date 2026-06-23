import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  FRONTEND_URL: z.string().url(),
  FINIX_ENV: z.enum(['sandbox', 'prod']).default('sandbox'),
  FINIX_API_USERNAME: z.string().min(1),
  FINIX_API_PASSWORD: z.string().min(1),
  FINIX_MERCHANT_IDENTITY_ID: z.string().startsWith('ID').min(20),
  FINIX_WEBHOOK_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('tickets@studio3.dallas'),
  EVENT_SLUG: z.string().default('inside-the-mind-2026'),
  EVENT_POSTER_URL: z.string().url().optional(),
  FINIX_MERCHANT_DISPLAY_NAME: z.string().default('Studio 3'),
  PORT: z.coerce.number().default(3001),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const finixBaseUrl =
  env.FINIX_ENV === 'prod'
    ? 'https://finix.live-payments-api.com'
    : 'https://finix.sandbox-payments-api.com';
