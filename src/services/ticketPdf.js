import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../config/env.js';

function formatEventDate(date) {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

async function drawTicketPage(doc, data) {
  const verifyUrl = `${env.FRONTEND_URL}/admin/verify?t=${data.qrToken}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, { width: 200, margin: 1 });

  doc.fontSize(22).font('Helvetica-Bold').text('Studio 3', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).text(data.eventTitle, { align: 'center' });
  doc.moveDown();

  doc.fontSize(11).font('Helvetica');
  doc.text(`Venue: ${data.venue}`);
  doc.text(`Address: ${data.address}`);
  doc.text(`Date: ${formatEventDate(data.startsAt)}`);
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Attendee');
  doc.font('Helvetica').text(data.attendeeName);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Ticket Type');
  doc.font('Helvetica').text(data.ticketType);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Confirmation');
  doc.font('Helvetica').text(data.confirmationCode);
  doc.moveDown();

  doc.image(qrPng, { fit: [180, 180], align: 'center' });
  doc.moveDown();
  doc.fontSize(9).text('Present this QR code at the door for entry.', { align: 'center' });
}

export async function generateTicketPdf(data) {
  return generateTicketsPdf([data]);
}

export async function generateTicketsPdf(tickets) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    (async () => {
      for (let i = 0; i < tickets.length; i++) {
        if (i > 0) {
          doc.addPage();
        }
        await drawTicketPage(doc, tickets[i]);
      }
      doc.end();
    })().catch(reject);
  });
}
