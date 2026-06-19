import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getTicketPdfForUser } from '../services/fulfillment.js';
import { OrderStatus } from '@prisma/client';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
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

router.get('/:id/pdf', requireAuth, async (req, res) => {
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
