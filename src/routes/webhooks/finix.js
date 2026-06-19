import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { getTransfer } from '../../services/finix.js';
import { fulfillOrder } from '../../services/fulfillment.js';
import { CapacityExceededError } from '../../services/capacity.js';

const router = Router();

function verifyWebhookSignature(req) {
  if (!env.FINIX_WEBHOOK_SECRET) {
    console.warn('[webhook] FINIX_WEBHOOK_SECRET not set — skipping verification');
    return true;
  }

  const signature = req.headers['finix-signature'];
  if (!signature) {
    return false;
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return false;
  }

  const expected = crypto.createHmac('sha256', env.FINIX_WEBHOOK_SECRET).update(rawBody).digest('hex');

  return signature === expected || signature === `sha256=${expected}`;
}

router.post('/finix', async (req, res) => {
  if (!verifyWebhookSignature(req)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const payload = req.body;

  try {
    const transfers = payload._embedded?.transfers ?? [];

    for (const transfer of transfers) {
      if (transfer.state !== 'SUCCEEDED') {
        continue;
      }

      let tags = transfer.tags ?? {};
      if (!tags.buyer_email) {
        const full = await getTransfer(transfer.id);
        tags = full.tags ?? tags;
      }

      const buyerEmail = tags.buyer_email;
      const buyerName = tags.buyer_name;
      const buyerPhone = tags.buyer_phone;
      const quantity = parseInt(tags.quantity || '1', 10);
      const eventId = tags.event_id;

      if (!buyerEmail || !buyerName || !eventId) {
        console.warn('[webhook] Missing tags for transfer', transfer.id);
        continue;
      }

      try {
        await fulfillOrder({
          finixTransferId: transfer.id,
          buyerName,
          buyerEmail,
          buyerPhone,
          quantity: Number.isFinite(quantity) ? quantity : 1,
          amountCents: transfer.amount,
          eventId,
        });
      } catch (error) {
        if (error instanceof CapacityExceededError) {
          console.error('[webhook] Capacity exceeded after successful payment — manual refund may be required', {
            transferId: transfer.id,
            eventId,
            quantity,
            capacity: error.capacity,
            soldCount: error.soldCount,
          });
          continue;
        }
        throw error;
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[webhook]', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
