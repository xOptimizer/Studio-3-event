import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export class CapacityExceededError extends Error {
  constructor(capacity, soldCount, requested) {
    super('Event capacity exceeded');
    this.name = 'CapacityExceededError';
    this.capacity = capacity;
    this.soldCount = soldCount;
    this.requested = requested;
    this.remaining = Math.max(0, capacity - soldCount);
  }
}

export async function countSoldTickets(eventId, tx = prisma) {
  return tx.ticket.count({
    where: {
      order: { eventId, status: OrderStatus.paid },
    },
  });
}

export async function assertEventCapacity(eventId, quantity, tx = prisma) {
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event || event.capacity == null) {
    return { capacity: event?.capacity ?? null, soldCount: 0, remaining: null };
  }

  const soldCount = await countSoldTickets(eventId, tx);
  const remaining = event.capacity - soldCount;

  if (quantity > remaining) {
    throw new CapacityExceededError(event.capacity, soldCount, quantity);
  }

  return { capacity: event.capacity, soldCount, remaining: remaining - quantity };
}
