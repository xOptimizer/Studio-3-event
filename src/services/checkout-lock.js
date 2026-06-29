import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';

const LOCK_TTL_MS = 15 * 60 * 1000;

function normalizeEmail(email) {
  return email.toLowerCase();
}

export async function acquireCheckoutLock(eventId, buyerEmail) {
  const email = normalizeEmail(buyerEmail);
  const now = new Date();

  await prisma.checkoutLock.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const existing = await prisma.checkoutLock.findUnique({
    where: { eventId_buyerEmail: { eventId, buyerEmail: email } },
  });

  if (existing) {
    return existing;
  }

  try {
    return await prisma.checkoutLock.create({
      data: {
        eventId,
        buyerEmail: email,
        idempotencyKey: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + LOCK_TTL_MS),
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return prisma.checkoutLock.findUniqueOrThrow({
        where: { eventId_buyerEmail: { eventId, buyerEmail: email } },
      });
    }
    throw error;
  }
}

export async function attachTransferToCheckoutLock(eventId, buyerEmail, finixTransferId) {
  await prisma.checkoutLock.update({
    where: { eventId_buyerEmail: { eventId, buyerEmail: normalizeEmail(buyerEmail) } },
    data: { finixTransferId },
  });
}

export async function releaseCheckoutLock(eventId, buyerEmail) {
  await prisma.checkoutLock.deleteMany({
    where: { eventId, buyerEmail: normalizeEmail(buyerEmail) },
  });
}
