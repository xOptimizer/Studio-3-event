import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { OrderStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { resendOrderTickets, issueFreePasses } from '../services/fulfillment.js';
import { CapacityExceededError, countSoldTickets } from '../services/capacity.js';
import { findTicketByVerificationInput, formatVerifiedTicket } from '../lib/ticketLookup.js';

const router = Router();

router.use(requireAuth, requireAdmin);

const guestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
});

const freePassSchema = z.object({
  eventId: z.string().min(1),
  guests: z.array(guestSchema).min(1).max(50),
});

const ticketLookupSchema = z
  .object({
    qrToken: z.string().min(1).optional(),
    bookingId: z.string().min(1).optional(),
    ticketId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.qrToken || data.bookingId || data.ticketId), {
    message: 'Provide qrToken, bookingId, or ticketId',
  });

router.post('/tickets/verify', async (req, res) => {
  const parsed = ticketLookupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Provide qrToken, bookingId, or ticketId' });
    return;
  }

  const ticket = await findTicketByVerificationInput(parsed.data);

  if (!ticket || ticket.order.status !== 'paid') {
    res.json({
      valid: false,
      result: 'invalid',
      message: 'Ticket not found or order not paid',
    });
    return;
  }

  const result =
    ticket.status === TicketStatus.used ? 'already_used' : ticket.status === TicketStatus.valid ? 'valid' : 'invalid';

  await prisma.scanLog.create({
    data: {
      ticketId: ticket.id,
      adminId: req.user.userId,
      result,
    },
  });

  res.json({
    valid: result === 'valid',
    result,
    ticket: formatVerifiedTicket(ticket),
  });
});

router.post('/tickets/check-in', async (req, res) => {
  const parsed = ticketLookupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Provide qrToken, bookingId, or ticketId' });
    return;
  }

  const ticket = await findTicketByVerificationInput(parsed.data);

  if (!ticket || ticket.order.status !== 'paid') {
    res.status(404).json({ error: 'Invalid ticket' });
    return;
  }

  if (ticket.status === TicketStatus.used) {
    res.status(400).json({ error: 'Ticket already used', status: ticket.status });
    return;
  }

  if (ticket.status === TicketStatus.cancelled) {
    res.status(400).json({ error: 'Ticket cancelled' });
    return;
  }

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: TicketStatus.used,
      checkedInAt: new Date(),
      checkedInById: req.user.userId,
    },
  });

  await prisma.scanLog.create({
    data: {
      ticketId: ticket.id,
      adminId: req.user.userId,
      result: 'checked_in',
    },
  });

  res.json({
    success: true,
    ticket: {
      id: updated.id,
      status: updated.status,
      checkedInAt: updated.checkedInAt,
      confirmationCode: updated.confirmationCode,
      attendeeName: updated.attendeeName,
    },
  });
});

router.get('/stats', async (_req, res) => {
  const event = await prisma.event.findUnique({
    where: { slug: env.EVENT_SLUG },
  });

  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const ticketsSold = await countSoldTickets(event.id);
  const earlyBirdSold = Math.min(ticketsSold, event.earlyBirdLimit);
  const earlyBirdRemaining = Math.max(0, event.earlyBirdLimit - ticketsSold);

  res.json({
    event: {
      title: event.title,
      earlyBirdLimit: event.earlyBirdLimit,
      earlyBirdPriceCents: event.priceCents,
      regularPriceCents: event.regularPriceCents,
    },
    ticketsSold,
    earlyBirdSold,
    earlyBirdRemaining,
    regularSold: Math.max(0, ticketsSold - event.earlyBirdLimit),
  });
});

router.get('/check-ins', async (_req, res) => {
  const tickets = await prisma.ticket.findMany({
    where: {
      status: TicketStatus.used,
      checkedInAt: { not: null },
      order: { status: OrderStatus.paid },
    },
    include: {
      order: { include: { event: true } },
      user: { select: { email: true, name: true } },
    },
    orderBy: { checkedInAt: 'desc' },
    take: 500,
  });

  const adminIds = [...new Set(tickets.map((t) => t.checkedInById).filter(Boolean))];
  const admins =
    adminIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true },
        })
      : [];
  const adminById = Object.fromEntries(admins.map((a) => [a.id, a.name]));

  res.json({
    total: tickets.length,
    checkIns: tickets.map((t) => ({
      id: t.id,
      attendeeName: t.attendeeName,
      confirmationCode: t.confirmationCode,
      checkedInAt: t.checkedInAt,
      checkedInBy: t.checkedInById ? adminById[t.checkedInById] || null : null,
      buyerEmail: t.user.email,
      buyerName: t.user.name,
      event: {
        title: t.order.event.title,
        venue: t.order.event.venue,
      },
    })),
  });
});

router.get('/events', async (_req, res) => {
  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      venue: true,
      startsAt: true,
      endsAt: true,
      priceCents: true,
      regularPriceCents: true,
      earlyBirdLimit: true,
      capacity: true,
    },
  });

  res.json({ events });
});

router.post('/free-passes', async (req, res) => {
  const parsed = freePassSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await issueFreePasses(parsed.data);

    if (!result.ok) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      message: `Issued ${result.issuedCount} free pass(es)`,
      issued: result.issued,
      failed: result.failed,
      issuedCount: result.issuedCount,
      failedCount: result.failedCount,
    });
  } catch (error) {
    if (error instanceof CapacityExceededError) {
      res.status(409).json({
        error: 'Event capacity exceeded',
        capacity: error.capacity,
        soldCount: error.soldCount,
        remaining: error.remaining,
      });
      return;
    }
    throw error;
  }
});

router.get('/orders', async (_req, res) => {
  const orders = await prisma.order.findMany({
    include: {
      event: true,
      user: { select: { email: true, name: true } },
      tickets: {
        select: {
          id: true,
          status: true,
          confirmationCode: true,
          attendeeName: true,
          checkedInAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ orders });
});

router.post('/orders/:orderId/resend', async (req, res) => {
  const orderId = String(req.params.orderId);
  const result = await resendOrderTickets(orderId);

  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    message: `Ticket email resent to ${result.email}`,
    email: result.email,
    ticketCount: result.ticketCount,
  });
});

router.get('/tickets/:id/qr', async (req, res) => {
  const ticketId = String(req.params.id);

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      order: { status: OrderStatus.paid },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  const verifyUrl = `${env.FRONTEND_URL}/admin/verify?t=${ticket.qrToken}`;
  const png = await QRCode.toBuffer(verifyUrl, { width: 320, margin: 1 });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(png);
});

export default router;
