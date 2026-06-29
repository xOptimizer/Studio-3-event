import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { EMAIL_BANNER_CID, getEmailBannerBuffer } from '../lib/emailAssets.js';
import { buildTicketDeliveryEmailContent } from '../templates/ticketEmailTemplate.js';

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

function loginUrl() {
  return env.PUBLIC_SITE_URL.replace(/\/$/, '');
}

export function buildTicketDeliveryEmailText(params) {
  const { text } = buildTicketDeliveryEmailContent({
    ...params,
    siteUrl: loginUrl(),
    hasBanner: false,
  });
  return text;
}

async function sendTicketDeliveryEmail(params) {
  const transport = getTransporter();
  const bannerBuffer = await getEmailBannerBuffer();
  const hasBanner = Boolean(bannerBuffer);
  const { text, html } = buildTicketDeliveryEmailContent({
    ...params,
    siteUrl: loginUrl(),
    hasBanner,
  });

  const subject = params.isComplimentary
    ? `Your complimentary Studio 3 pass — ${params.eventTitle}`
    : `Your Studio 3 ticket — ${params.eventTitle}`;

  if (!transport) {
    console.warn('[email] SMTP not configured — skipping send to', params.to);
    console.info('[email] Preview body:', text);
    return;
  }

  const attachments = [
    {
      filename: params.pdfFilename,
      content: params.pdfBuffer,
      contentType: 'application/pdf',
    },
  ];

  if (bannerBuffer) {
    attachments.unshift({
      filename: 'ticket-banner.jpg',
      content: bannerBuffer,
      cid: EMAIL_BANNER_CID,
      contentType: 'image/jpeg',
    });
  }

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: params.to,
    subject,
    text,
    html,
    attachments,
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
