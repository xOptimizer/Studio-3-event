import { Router } from 'express';
import QRCode from 'qrcode';
import { requireAuth, requirePasswordChanged } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { getTicketPdfForUser } from '../services/fulfillment.js';
import { OrderStatus } from '@prisma/client';

const router = Router();

router.get('/', requireAuth, requirePasswordChanged, async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    where: {
      userId: req.user.userId,
      order: { status: OrderStatus.paid },
    },
    include: {
      order: {
        include: { event: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      confirmationCode: t.confirmationCode,
      qrToken: t.qrToken,
      status: t.status,
      attendeeName: t.attendeeName,
      checkedInAt: t.checkedInAt,
      event: {
        title: t.order.event.title,
        venue: t.order.event.venue,
        address: t.order.event.address,
        startsAt: t.order.event.startsAt,
        endsAt: t.order.event.endsAt,
      },
      orderId: t.orderId,
      amountCents: t.order.amountCents,
      quantity: t.order.quantity,
    })),
  });
});

router.get('/:id/qr', requireAuth, requirePasswordChanged, async (req, res) => {
  const ticketId = String(req.params.id);

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      userId: req.user.userId,
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

router.get('/:id/pdf', requireAuth, requirePasswordChanged, async (req, res) => {
  const ticketId = String(req.params.id);
  const pdf = await getTicketPdfForUser(ticketId, req.user.userId);

  if (!pdf) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticketId}.pdf"`);
  res.send(pdf);
});

export default router;
