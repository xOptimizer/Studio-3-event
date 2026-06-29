import crypto from 'crypto';
import { OrderStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { reverseTransfer } from './finix.js';

export async function refundOrder(orderId, { reason } = {}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { tickets: true },
  });

  if (!order) {
    return { ok: false, status: 404, error: 'Order not found' };
  }

  if (order.status === OrderStatus.refunded) {
    return { ok: false, status: 400, error: 'Order is already refunded' };
  }

  if (order.status !== OrderStatus.paid && order.status !== OrderStatus.pending) {
    return { ok: false, status: 400, error: 'Only paid or pending orders can be refunded' };
  }

  if (!order.finixTransferId) {
    return { ok: false, status: 400, error: 'Order has no Finix transfer to refund' };
  }

  const reversal = await reverseTransfer(order.finixTransferId, {
    refundAmountCents: order.amountCents,
    idempotencyId: crypto.randomUUID(),
    tags: {
      reason: reason || 'duplicate_payment',
      order_id: order.id,
    },
  });

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.refunded },
    }),
    ...(order.tickets.length
      ? [
          prisma.ticket.updateMany({
            where: { orderId: order.id, status: TicketStatus.valid },
            data: { status: TicketStatus.cancelled },
          }),
        ]
      : []),
  ]);

  return {
    ok: true,
    orderId: order.id,
    finixTransferId: order.finixTransferId,
    reversalId: reversal.id,
    reversalState: reversal.state,
  };
}

export async function findDuplicateOrdersForEmail(email, eventId) {
  const orders = await prisma.order.findMany({
    where: {
      buyerEmail: email.toLowerCase(),
      ...(eventId ? { eventId } : {}),
      isFreePass: false,
      finixTransferId: { not: null },
      status: { in: [OrderStatus.paid, OrderStatus.pending] },
    },
    include: {
      event: { select: { id: true, title: true, slug: true } },
      tickets: { select: { id: true, confirmationCode: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (orders.length < 2) {
    return { duplicates: false, orders };
  }

  return {
    duplicates: true,
    orders,
    recommendation:
      'Keep the oldest fulfilled order and refund the duplicate(s) using POST /admin/orders/:orderId/refund',
  };
}
