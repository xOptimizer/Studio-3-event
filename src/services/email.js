import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

function formatEventDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function loginUrl() {
  return env.PUBLIC_SITE_URL.replace(/\/$/, '');
}

function buildLoginSection({ to, isNewUser, plainPassword }) {
  const site = loginUrl();
  if (isNewUser && plainPassword) {
    return `Your account has been created. Log in to view your tickets anytime:

Email: ${to}
Password: ${plainPassword}

Login: ${site}`;
  }

  return `You can log in with your existing Studio 3 account to view your tickets:

${site}`;
}

function buildTicketLines(tickets) {
  if (!tickets?.length) return '';

  return tickets
    .map((ticket, index) => {
      const prefix = tickets.length > 1 ? `Ticket ${index + 1}\n` : '';
      return `${prefix}  Attendee: ${ticket.attendeeName}
  Confirmation code: ${ticket.confirmationCode}`;
    })
    .join('\n\n');
}

export function buildTicketDeliveryEmailText(params) {
  const {
    name,
    to,
    eventTitle,
    venue,
    address,
    startsAt,
    tickets = [],
    isNewUser,
    plainPassword,
    isComplimentary = false,
  } = params;

  const intro = isComplimentary
    ? `You've received a complimentary pass for ${eventTitle}.`
    : `Thank you for your purchase for ${eventTitle}.`;

  const dateLine = formatEventDateTime(startsAt);
  const eventDetails = [
    'Event details:',
    eventTitle,
    venue ? `Venue: ${venue}` : null,
    address ? `Address: ${address}` : null,
    dateLine ? `Date: ${dateLine}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const ticketBlock = tickets.length
    ? `\nYour ticket${tickets.length > 1 ? 's' : ''}:\n${buildTicketLines(tickets)}`
    : '';

  return `Hi ${name},

${intro}

${eventDetails}${ticketBlock}

Your ticket(s) are attached as a PDF. Each ticket includes a QR code for entry at the door.

${buildLoginSection({ to, isNewUser, plainPassword })}

See you there,
Studio 3`;
}

async function sendTicketDeliveryEmail(params) {
  const transport = getTransporter();
  const text = buildTicketDeliveryEmailText(params);
  const subject = params.isComplimentary
    ? `Your complimentary Studio 3 pass — ${params.eventTitle}`
    : `Your Studio 3 ticket — ${params.eventTitle}`;

  if (!transport) {
    console.warn('[email] SMTP not configured — skipping send to', params.to);
    console.info('[email] Preview body:', text);
    return;
  }

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: params.to,
    subject,
    text,
    attachments: [
      {
        filename: params.pdfFilename,
        content: params.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

export async function sendFulfillmentEmail(params) {
  return sendTicketDeliveryEmail({ ...params, isComplimentary: false });
}

export async function sendFreePassEmail(params) {
  return sendTicketDeliveryEmail({ ...params, isComplimentary: true });
}

export async function sendTicketResendEmail(params) {
  const transport = getTransporter();

  const text = `
Hi ${params.name},

Here are your ticket(s) again for ${params.eventTitle}.

Your ticket(s) are attached as a PDF. Each ticket includes a QR code for entry at the door.

View tickets anytime after logging in: ${loginUrl()}

See you there,
Studio 3
`;

  if (!transport) {
    console.warn('[email] SMTP not configured — skipping resend to', params.to);
    console.info('[email] Preview body:', text);
    return;
  }

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: params.to,
    subject: `Your Studio 3 ticket — ${params.eventTitle}`,
    text,
    attachments: [
      {
        filename: params.pdfFilename,
        content: params.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

export async function sendPasswordResetOtpEmail({ to, name, otp }) {
  const transport = getTransporter();

  const text = `
Hi ${name},

We received a request to reset your Studio 3 account password.

Your verification code is: ${otp}

This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.

Studio 3
`;

  if (!transport) {
    console.warn('[email] SMTP not configured — skipping password reset OTP to', to);
    console.info('[email] Password reset OTP:', otp);
    return;
  }

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: 'Studio 3 — Password reset code',
    text,
  });
}
