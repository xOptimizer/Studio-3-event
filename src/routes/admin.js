import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { OrderStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { resendOrderTickets, issueFreePasses } from '../services/fulfillment.js';
import { CapacityExceededError } from '../services/capacity.js';

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

const verifySchema = z.object({
  qrToken: z.string().min(1),
});

router.post('/tickets/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid qrToken' });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { qrToken: parsed.data.qrToken },
    include: {
      order: { include: { event: true } },
      user: { select: { email: true, name: true } },
    },
  });

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
    ticket: {
      id: ticket.id,
      confirmationCode: ticket.confirmationCode,
      status: ticket.status,
      attendeeName: ticket.attendeeName,
      checkedInAt: ticket.checkedInAt,
      event: {
        title: ticket.order.event.title,
        venue: ticket.order.event.venue,
        startsAt: ticket.order.event.startsAt,
      },
      buyerEmail: ticket.user.email,
    },
  });
});

const checkInSchema = z.object({
  qrToken: z.string().min(1),
});

router.post('/tickets/check-in', async (req, res) => {
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid qrToken' });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { qrToken: parsed.data.qrToken },
    include: { order: true },
  });

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
