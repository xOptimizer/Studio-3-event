import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { OrderStatus, TicketStatus, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { generateTicketPdf, generateTicketsPdf } from './ticketPdf.js';
import { sendFulfillmentEmail, sendTicketResendEmail, sendFreePassEmail } from './email.js';
import { assertEventCapacity } from './capacity.js';

function generatePassword() {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

function generateConfirmationCode() {
  return `SSC-${Math.floor(100000 + Math.random() * 900000)}`;
}

function generateQrToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function findOrCreateUser(input) {
  const email = input.buyerEmail.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  let isNewUser = false;
  let plainPassword;

  if (!user) {
    isNewUser = true;
    plainPassword = generatePassword();
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    try {
      user = await prisma.user.create({
        data: {
          email,
          name: input.buyerName,
          phone: input.buyerPhone,
          passwordHash,
          mustChangePassword: true,
          role: UserRole.user,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        user = await prisma.user.findUniqueOrThrow({ where: { email } });
        isNewUser = false;
        plainPassword = undefined;
      } else {
        throw error;
      }
    }
  } else if (input.buyerPhone && !user.phone) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { phone: input.buyerPhone, name: input.buyerName },
    });
  }

  return { user, isNewUser, plainPassword };
}

async function findOrCreatePendingOrder(tx, input, userId, eventId) {
  const existing = await tx.order.findUnique({
    where: { finixTransferId: input.finixTransferId },
    include: { tickets: true },
  });

  if (existing) {
    return existing;
  }

  try {
    return await tx.order.create({
      data: {
        userId,
        eventId,
        quantity: input.quantity,
        amountCents: input.amountCents,
        status: OrderStatus.pending,
        finixTransferId: input.finixTransferId,
        buyerEmail: input.buyerEmail.toLowerCase(),
        buyerPhone: input.buyerPhone,
      },
      include: { tickets: true },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return tx.order.findUniqueOrThrow({
        where: { finixTransferId: input.finixTransferId },
        include: { tickets: true },
      });
    }
    throw error;
  }
}

export async function fulfillOrder(input) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: input.eventId } });
  const { user, isNewUser, plainPassword } = await findOrCreateUser(input);

  const fulfillment = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;

    const order = await findOrCreatePendingOrder(tx, input, user.id, event.id);

    if (order.status === OrderStatus.paid) {
      return {
        orderId: order.id,
        ticketIds: order.tickets.map((t) => t.id),
        alreadyFulfilled: true,
      };
    }

    await assertEventCapacity(event.id, input.quantity, tx);

    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: OrderStatus.pending },
      data: { status: OrderStatus.paid, userId: user.id },
    });

    if (count === 0) {
      const refreshed = await tx.order.findUnique({
        where: { id: order.id },
        include: { tickets: true },
      });

      if (refreshed?.status === OrderStatus.paid) {
        return {
          orderId: refreshed.id,
          ticketIds: refreshed.tickets.map((t) => t.id),
          alreadyFulfilled: true,
        };
      }

      throw new Error(`Order ${order.id} could not be marked paid`);
    }

    const created = [];
    for (let i = 0; i < input.quantity; i++) {
      const ticket = await tx.ticket.create({
        data: {
          orderId: order.id,
          userId: user.id,
          confirmationCode: generateConfirmationCode(),
          qrToken: generateQrToken(),
          status: TicketStatus.valid,
          attendeeName: input.buyerName,
        },
      });
      created.push(ticket);
    }

    return {
      orderId: order.id,
      ticketIds: created.map((t) => t.id),
      ticketRecords: created,
      alreadyFulfilled: false,
      isNewUser,
      plainPassword,
    };
  });

  if (fulfillment.alreadyFulfilled) {
    return {
      orderId: fulfillment.orderId,
      ticketIds: fulfillment.ticketIds,
      alreadyFulfilled: true,
    };
  }

  const pdfTickets = fulfillment.ticketRecords.map((t) => ({
    eventSlug: event.slug,
    eventTitle: event.title,
    venue: event.venue,
    address: event.address,
    startsAt: event.startsAt,
    attendeeName: t.attendeeName,
    confirmationCode: t.confirmationCode,
    qrToken: t.qrToken,
    ticketType: 'General Admission',
    status: t.status,
  }));

  const combinedPdf = await generateTicketsPdf(pdfTickets);

  await sendFulfillmentEmail({
    to: input.buyerEmail,
    name: input.buyerName,
    eventTitle: event.title,
    venue: event.venue,
    address: event.address,
    startsAt: event.startsAt,
    tickets: fulfillment.ticketRecords.map((t) => ({
      attendeeName: t.attendeeName,
      confirmationCode: t.confirmationCode,
    })),
    isNewUser: fulfillment.isNewUser,
    plainPassword: fulfillment.plainPassword,
    pdfBuffer: combinedPdf,
    pdfFilename: `studio3-tickets-${fulfillment.orderId}.pdf`,
  });

  return {
    orderId: fulfillment.orderId,
    ticketIds: fulfillment.ticketIds,
    alreadyFulfilled: false,
  };
}

async function issueOneFreePass(event, guest) {
  const buyerEmail = guest.email.toLowerCase().trim();
  const attendeeName = `${guest.firstName.trim()} ${guest.lastName.trim()}`.replace(/\s+/g, ' ');

  const { user, isNewUser, plainPassword } = await findOrCreateUser({
    buyerEmail,
    buyerName: attendeeName,
    buyerPhone: null,
  });

  const fulfillment = await prisma.$transaction(async (tx) => {
    await assertEventCapacity(event.id, 1, tx);

    const order = await tx.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        quantity: 1,
        amountCents: 0,
        status: OrderStatus.paid,
        finixTransferId: null,
        buyerEmail,
      },
    });

    const ticket = await tx.ticket.create({
      data: {
        orderId: order.id,
        userId: user.id,
        confirmationCode: generateConfirmationCode(),
        qrToken: generateQrToken(),
        status: TicketStatus.valid,
        attendeeName,
      },
    });

    return { order, ticket, isNewUser, plainPassword };
  });

  const pdfTicket = {
    eventSlug: event.slug,
    eventTitle: event.title,
    venue: event.venue,
    address: event.address,
    startsAt: event.startsAt,
    attendeeName: fulfillment.ticket.attendeeName,
    confirmationCode: fulfillment.ticket.confirmationCode,
    qrToken: fulfillment.ticket.qrToken,
    ticketType: 'Complimentary Pass',
    status: fulfillment.ticket.status,
  };

  const pdfBuffer = await generateTicketPdf(pdfTicket);

  await sendFreePassEmail({
    to: buyerEmail,
    name: attendeeName,
    eventTitle: event.title,
    venue: event.venue,
    address: event.address,
    startsAt: event.startsAt,
    tickets: [
      {
        attendeeName: fulfillment.ticket.attendeeName,
        confirmationCode: fulfillment.ticket.confirmationCode,
      },
    ],
    isNewUser,
    plainPassword,
    pdfBuffer,
    pdfFilename: `studio3-free-pass-${fulfillment.ticket.confirmationCode}.pdf`,
  });

  return {
    orderId: fulfillment.order.id,
    ticketId: fulfillment.ticket.id,
    confirmationCode: fulfillment.ticket.confirmationCode,
    email: buyerEmail,
    name: attendeeName,
  };
}

export async function issueFreePasses({ eventId, guests }) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return { ok: false, status: 404, error: 'Event not found' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;
    await assertEventCapacity(event.id, guests.length, tx);
  });

  const issued = [];
  const failed = [];

  for (const guest of guests) {
    try {
      const result = await issueOneFreePass(event, guest);
      issued.push(result);
    } catch (error) {
      failed.push({
        email: guest.email,
        name: `${guest.firstName} ${guest.lastName}`.trim(),
        error: error.message || 'Failed to issue pass',
      });
    }
  }

  return {
    ok: true,
    issued,
    failed,
    issuedCount: issued.length,
    failedCount: failed.length,
  };
}

export async function resendOrderTickets(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      event: true,
      tickets: true,
      user: { select: { name: true, email: true } },
    },
  });

  if (!order) {
    return { ok: false, status: 404, error: 'Order not found' };
  }

  if (order.status !== OrderStatus.paid) {
    return { ok: false, status: 400, error: 'Tickets can only be resent for paid orders' };
  }

  if (!order.tickets.length) {
    return { ok: false, status: 400, error: 'No tickets found for this order' };
  }

  const pdfTickets = order.tickets.map((t) => ({
    eventSlug: order.event.slug,
    eventTitle: order.event.title,
    venue: order.event.venue,
    address: order.event.address,
    startsAt: order.event.startsAt,
    attendeeName: t.attendeeName,
    confirmationCode: t.confirmationCode,
    qrToken: t.qrToken,
    ticketType: 'General Admission',
    status: t.status,
  }));

  const combinedPdf = await generateTicketsPdf(pdfTickets);

  await sendTicketResendEmail({
    to: order.buyerEmail,
    name: order.user?.name || order.tickets[0]?.attendeeName || 'Guest',
    eventTitle: order.event.title,
    pdfBuffer: combinedPdf,
    pdfFilename: `studio3-tickets-${order.id}.pdf`,
  });

  return {
    ok: true,
    email: order.buyerEmail,
    ticketCount: order.tickets.length,
  };
}

export async function getTicketPdfForUser(ticketId, userId) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, userId },
    include: { order: { include: { event: true } } },
  });

  if (!ticket || ticket.order.status !== OrderStatus.paid) {
    return null;
  }

  return generateTicketPdf({
    eventSlug: ticket.order.event.slug,
    eventTitle: ticket.order.event.title,
    venue: ticket.order.event.venue,
    address: ticket.order.event.address,
    startsAt: ticket.order.event.startsAt,
    attendeeName: ticket.attendeeName,
    confirmationCode: ticket.confirmationCode,
    qrToken: ticket.qrToken,
    ticketType: 'General Admission',
    status: ticket.status,
  });
}
