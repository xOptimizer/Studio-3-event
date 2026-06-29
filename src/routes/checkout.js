import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  createApplePaySession,
  createBuyerIdentity,
  createPaymentInstrument,
  createTransfer,
  createWalletPaymentInstrument,
  getTransfer,
} from '../services/finix.js';
import {
  findRecoverablePendingOrder,
  fulfillPaidTransfer,
  recordPendingOrderAfterTransfer,
  toFulfillmentInput,
} from '../services/fulfillment.js';
import {
  acquireCheckoutLock,
  attachTransferToCheckoutLock,
} from '../services/checkout-lock.js';
import { assertEventCapacity, CapacityExceededError, countSoldTickets } from '../services/capacity.js';
import {
  calculateTieredOrderPricing,
  getEventPricingTiers,
  SALES_TAX_RATE,
  SERVICE_FEE_RATE,
} from '../lib/pricing.js';

const router = Router();

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const buyerFields = {
  quantity: z.number().int().min(1).max(5),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(7).max(30),
  fraudSessionId: z.string().optional(),
};

const walletAddressSchema = z.object({
  country: z.string().min(2).max(3),
  postal_code: z.string().min(1).max(20),
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(50).optional(),
});

const checkoutSchema = z.discriminatedUnion('paymentMethod', [
  z.object({
    paymentMethod: z.literal('card'),
    token: z.string().min(1),
    ...buyerFields,
  }),
  z.object({
    paymentMethod: z.literal('apple_pay'),
    thirdPartyToken: z.string().min(1),
    walletName: z.string().min(1).max(200),
    address: walletAddressSchema,
    ...buyerFields,
  }),
  z.object({
    paymentMethod: z.literal('google_pay'),
    thirdPartyToken: z.string().min(1),
    walletName: z.string().min(1).max(200),
    address: walletAddressSchema,
    ...buyerFields,
  }),
]);

const legacyCheckoutSchema = z
  .object({
    token: z.string().min(1),
    ...buyerFields,
  })
  .transform((data) => ({ ...data, paymentMethod: 'card' }));

const applePaySessionSchema = z.object({
  validationUrl: z.string().url(),
  domain: z.string().min(1).max(253),
});

function normalizeWalletAddress(address) {
  const country =
    address.country.length === 2 && address.country.toUpperCase() === 'US'
      ? 'USA'
      : address.country.toUpperCase();

  return { ...address, country };
}

async function loadCheckoutEvent() {
  return prisma.event.findUnique({
    where: { slug: env.EVENT_SLUG },
  });
}

async function createPaymentInstrumentForCheckout(identityId, checkout, buyerName) {
  if (checkout.paymentMethod === 'card') {
    return createPaymentInstrument(identityId, checkout.token, buyerName);
  }

  const walletType = checkout.paymentMethod === 'apple_pay' ? 'APPLE_PAY' : 'GOOGLE_PAY';

  return createWalletPaymentInstrument(identityId, {
    type: walletType,
    thirdPartyToken: checkout.thirdPartyToken,
    name: checkout.walletName,
    address: normalizeWalletAddress(checkout.address),
  });
}

const PAYMENT_RECEIVED_MESSAGE =
  'Payment received. Your tickets are being processed and will be emailed shortly. Please do not pay again.';

const PAYMENT_ALREADY_RECEIVED_MESSAGE =
  'We already received your payment but ticket delivery is still processing. Please do not pay again. You will receive an email shortly, or contact support if it does not arrive within 30 minutes.';

async function respondToTransfer(res, transfer, fulfillmentInput) {
  if (transfer.state === 'SUCCEEDED') {
    try {
      const result = await fulfillPaidTransfer(fulfillmentInput);
      res.json({
        success: true,
        orderId: result.orderId,
        transferId: transfer.id,
        message: 'Payment successful. Check your email for your ticket and login details.',
      });
    } catch (error) {
      console.error('[checkout] Fulfillment failed after successful payment', {
        transferId: transfer.id,
        buyerEmail: fulfillmentInput.buyerEmail,
        error,
      });
      res.json({
        success: true,
        pending: true,
        transferId: transfer.id,
        message: PAYMENT_RECEIVED_MESSAGE,
      });
    }
    return;
  }

  if (transfer.state === 'PENDING') {
    await recordPendingOrderAfterTransferSafe(fulfillmentInput);
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
}

async function recordPendingOrderAfterTransferSafe(input) {
  try {
    await recordPendingOrderAfterTransfer(input);
  } catch (error) {
    console.error('[checkout] Could not record pending order after transfer', {
      finixTransferId: input.finixTransferId,
      error,
    });
  }
}

async function tryRecoverPendingPayment(res, pendingOrder, buyerName, buyerPhone) {
  try {
    const result = await fulfillPaidTransfer(
      toFulfillmentInput(pendingOrder, { buyerName, buyerPhone })
    );
    res.json({
      success: true,
      recovered: true,
      orderId: result.orderId,
      transferId: pendingOrder.finixTransferId,
      message: 'Your previous payment was found. Check your email for your ticket and login details.',
    });
  } catch (error) {
    console.error('[checkout] Could not recover pending payment', {
      orderId: pendingOrder.id,
      transferId: pendingOrder.finixTransferId,
      error,
    });
    res.status(409).json({
      error: 'Payment already received',
      orderId: pendingOrder.id,
      transferId: pendingOrder.finixTransferId,
      message: PAYMENT_ALREADY_RECEIVED_MESSAGE,
    });
  }
}

function handleCheckoutError(res, error) {
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

  if (error.code === 'P2028') {
    res.status(503).json({
      error: 'Order fulfillment temporarily unavailable',
      message: PAYMENT_RECEIVED_MESSAGE,
    });
    return;
  }

  res.status(500).json({
    error: 'Checkout failed',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}

router.get('/config', async (_req, res) => {
  try {
    const event = await loadCheckoutEvent();

    if (!event) {
      res.status(404).json({ error: 'Event not found. Run npm run db:seed on the API.' });
      return;
    }

    const soldCount = await countSoldTickets(event.id);
    const tiers = getEventPricingTiers(event);
    const samplePricing = calculateTieredOrderPricing({
      soldCount,
      quantity: 1,
      ...tiers,
    });

    res.json({
      finixEnv: env.FINIX_ENV,
      merchantIdentityId: env.FINIX_MERCHANT_IDENTITY_ID,
      merchantDisplayName: env.FINIX_MERCHANT_DISPLAY_NAME,
      paymentMethods: ['card', 'apple_pay', 'google_pay'],
      pricing: {
        salesTaxRate: SALES_TAX_RATE,
        serviceFeeRate: SERVICE_FEE_RATE,
        soldCount,
        earlyBirdLimit: tiers.earlyBirdLimit,
        earlyBirdRemaining: samplePricing.earlyBirdRemaining,
        earlyBirdPriceCents: tiers.earlyBirdPriceCents,
        regularPriceCents: tiers.regularPriceCents,
        currentTier: samplePricing.currentTier,
      },
      event: {
        slug: event.slug,
        title: event.title,
        priceCents: event.priceCents,
        regularPriceCents: event.regularPriceCents,
        earlyBirdLimit: event.earlyBirdLimit,
        currency: event.currency,
        venue: event.venue,
        startsAt: event.startsAt,
      },
    });
  } catch (error) {
    handleCheckoutError(res, error);
  }
});

router.post('/apple-pay-session', checkoutLimiter, async (req, res) => {
  const parsed = applePaySessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Apple Pay session data', details: parsed.error.flatten() });
    return;
  }

  const { validationUrl, domain } = parsed.data;

  try {
    const session = await createApplePaySession({
      displayName: env.FINIX_MERCHANT_DISPLAY_NAME,
      domain,
      merchantIdentity: env.FINIX_MERCHANT_IDENTITY_ID,
      validationUrl,
    });

    res.json({
      sessionDetails: session.session_details,
    });
  } catch (error) {
    handleCheckoutError(res, error);
  }
});

router.post('/', checkoutLimiter, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  const checkoutResult = parsed.success ? parsed : legacyCheckoutSchema.safeParse(req.body);

  if (!checkoutResult.success) {
    res.status(400).json({ error: 'Invalid checkout data', details: checkoutResult.error.flatten() });
    return;
  }

  const checkout = checkoutResult.data;
  const { fraudSessionId, quantity, name, email, phone } = checkout;

  try {
    const event = await loadCheckoutEvent();

    if (!event) {
      res.status(404).json({ error: 'Event not found. Run npm run db:seed on the API.' });
      return;
    }

    const soldCount = await countSoldTickets(event.id);
    const tiers = getEventPricingTiers(event);
    const pricing = calculateTieredOrderPricing({
      soldCount,
      quantity,
      ...tiers,
    });
    const { totalCents: amountCents } = pricing;

    await assertEventCapacity(event.id, quantity);

    const checkoutLock = await acquireCheckoutLock(event.id, email);

    if (checkoutLock.finixTransferId) {
      const existingTransfer = await getTransfer(checkoutLock.finixTransferId);
      await respondToTransfer(res, existingTransfer, {
        finixTransferId: existingTransfer.id,
        buyerName: name,
        buyerEmail: email,
        buyerPhone: phone,
        quantity,
        amountCents,
        eventId: event.id,
      });
      return;
    }

    const pendingOrder = await findRecoverablePendingOrder(event.id, email);
    if (pendingOrder) {
      await attachTransferToCheckoutLock(event.id, email, pendingOrder.finixTransferId);
      await tryRecoverPendingPayment(res, pendingOrder, name, phone);
      return;
    }

    const identity = await createBuyerIdentity(name, email);
    const paymentInstrument = await createPaymentInstrumentForCheckout(identity.id, checkout, name);
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
        payment_method: checkout.paymentMethod,
      },
      checkoutLock.idempotencyKey
    );

    await attachTransferToCheckoutLock(event.id, email, transfer.id);

    await respondToTransfer(res, transfer, {
      finixTransferId: transfer.id,
      buyerName: name,
      buyerEmail: email,
      buyerPhone: phone,
      quantity,
      amountCents,
      eventId: event.id,
    });
  } catch (error) {
    handleCheckoutError(res, error);
  }
});

export default router;
