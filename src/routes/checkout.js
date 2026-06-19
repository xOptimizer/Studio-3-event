import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  createBuyerIdentity,
  createPaymentInstrument,
  createTransfer,
} from '../services/finix.js';
import { fulfillOrder } from '../services/fulfillment.js';
import { assertEventCapacity, CapacityExceededError } from '../services/capacity.js';

const router = Router();

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const checkoutSchema = z.object({
  token: z.string().min(1),
  fraudSessionId: z.string().optional(),
  quantity: z.number().int().min(1).max(5),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(7).max(30),
});

router.post('/', checkoutLimiter, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid checkout data', details: parsed.error.flatten() });
    return;
  }

  const { token, fraudSessionId, quantity, name, email, phone } = parsed.data;

  try {
    const event = await prisma.event.findUnique({
      where: { slug: env.EVENT_SLUG },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found. Run npm run db:seed on the API.' });
      return;
    }

    const amountCents = event.priceCents * quantity;

    await assertEventCapacity(event.id, quantity);

    const identity = await createBuyerIdentity(name, email);
    const paymentInstrument = await createPaymentInstrument(identity.id, token, name);
    const transfer = await createTransfer(
      paymentInstrument.id,
      amountCents,
      fraudSessionId,
      {
        buyer_email: email.toLowerCase(),
        buyer_name: name,
        buyer_phone: phone,
        quantity: String(quantity),
        event_id: event.id,
      }
    );

    if (transfer.state === 'SUCCEEDED') {
      const result = await fulfillOrder({
        finixTransferId: transfer.id,
        buyerName: name,
        buyerEmail: email,
        buyerPhone: phone,
        quantity,
        amountCents,
        eventId: event.id,
      });

      res.json({
        success: true,
        orderId: result.orderId,
        transferId: transfer.id,
        message: 'Payment successful. Check your email for your ticket and login details.',
      });
      return;
    }

    if (transfer.state === 'PENDING') {
      res.json({
        success: true,
        pending: true,
        transferId: transfer.id,
        message: 'Payment is processing. You will receive an email when it completes.',
      });
      return;
    }

    res.status(400).json({
      error: 'Payment failed',
      transferState: transfer.state,
    });
  } catch (error) {
    console.error('[checkout]', error);
    if (error.finixBody) {
      console.error('[checkout] Finix details:', JSON.stringify(error.finixBody, null, 2));
    }

    if (error instanceof CapacityExceededError) {
      res.status(409).json({
        error: 'Event sold out during checkout',
        remaining: error.remaining,
        message:
          'Inventory was exhausted while processing your payment. If you were charged, contact support with your confirmation email.',
      });
      return;
    }

    if (error.code === 'P1001' || error.name === 'PrismaClientInitializationError') {
      res.status(503).json({
        error: 'Database unavailable',
        message: 'Could not connect to the database. Restart the API server and try again.',
      });
      return;
    }

    res.status(500).json({
      error: 'Checkout failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
