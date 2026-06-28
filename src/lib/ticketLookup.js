import { prisma } from './prisma.js';

const ticketInclude = {
  order: { include: { event: true } },
  user: { select: { email: true, name: true } },
};

export function normalizeBookingId(input) {
  const trimmed = String(input || '').trim().toUpperCase();
  if (!trimmed) return '';

  if (/^SSC-\d{6}$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 6) {
    return `SSC-${digits.slice(-6)}`;
  }

  return trimmed;
}

export async function findTicketByVerificationInput(input) {
  const qrToken = input.qrToken?.trim();
  if (qrToken) {
    return prisma.ticket.findUnique({
      where: { qrToken },
      include: ticketInclude,
    });
  }

  const ticketId = input.ticketId?.trim();
  if (ticketId) {
    return prisma.ticket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });
  }

  const bookingId = input.bookingId?.trim();
  if (bookingId) {
    const confirmationCode = normalizeBookingId(bookingId);
    return prisma.ticket.findFirst({
      where: { confirmationCode },
      include: ticketInclude,
    });
  }

  return null;
}

export function formatVerifiedTicket(ticket) {
  return {
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
  };
}
