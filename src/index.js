import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import authRouter from './routes/auth.js';
import passwordResetRouter from './routes/passwordReset.js';
import profileRouter from './routes/profile.js';
import checkoutRouter from './routes/checkout.js';
import ticketsRouter from './routes/tickets.js';
import adminRouter from './routes/admin.js';
import finixWebhookRouter from './routes/webhooks/finix.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

app.use('/webhooks/finix', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body;
  try {
    req.body = JSON.parse(req.body.toString('utf8'));
  } catch {
    req.body = {};
  }
  next();
});

app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/', (_req, res) => {
  res.type('text').send('Studio 3 Event Server running');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authLimiter, authRouter);
app.use('/auth', authLimiter, passwordResetRouter);
app.use('/profile', authLimiter, profileRouter);
app.use('/checkout', checkoutRouter);
app.use('/tickets', ticketsRouter);
app.use('/admin', adminRouter);
app.use('/webhooks', finixWebhookRouter);

try {
  await prisma.$connect();
  console.log('Database connected');
} catch (error) {
  console.error('Database connection failed on startup:', error.message);
}

app.listen(env.PORT, () => {
  console.log(`Studio 3 Ticketing API listening on port ${env.PORT}`);
});
