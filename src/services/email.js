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

export async function sendFulfillmentEmail(params) {
  const transport = getTransporter();

  const loginSection = params.isNewUser && params.plainPassword
    ? `
Your account has been created. Log in to view your tickets anytime:

Email: ${params.to}
Password: ${params.plainPassword}

Login: ${env.FRONTEND_URL}
`
    : `
You can log in with your existing Studio 3 account to view your tickets:

${env.FRONTEND_URL}
`;

  const text = `
Hi ${params.name},

Thank you for your purchase for ${params.eventTitle}.

Your ticket(s) are attached as a PDF. Each ticket includes a QR code for entry at the door.
${loginSection}

See you there,
Studio 3
`;

  if (!transport) {
    console.warn('[email] SMTP not configured — skipping send to', params.to);
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
