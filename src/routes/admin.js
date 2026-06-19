import { Router } from 'express';
import { z } from 'zod';
import { TicketStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

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

router.get('/orders', async (_req, res) => {
  const orders = await prisma.order.findMany({
    include: {
      event: true,
      user: { select: { email: true, name: true } },
      tickets: { select: { id: true, status: true, confirmationCode: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ orders });
});

export default router;
