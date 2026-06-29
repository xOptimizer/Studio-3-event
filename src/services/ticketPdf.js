import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { EVENT_DISPLAY } from '../constants/eventDisplay.js';
import { getEventPosterBuffer, getLogoBuffer } from '../lib/ticketAssets.js';

const C = {
  page: '#F3F4F6',
  white: '#FFFFFF',
  text: '#1C1C1C',
  muted: '#9CA3AF',
  line: '#E5E7EB',
};

const W = 360;
const PAD = 28;
const R = 16;

function fmtDate() {
  return EVENT_DISPLAY.dateLabel;
}

function fmtTime() {
  return EVENT_DISPLAY.timeLabel;
}

function fmtBookingId(code) {
  const digits = code?.replace(/\D/g, '') ?? '';
  return digits.length >= 4 ? digits.padStart(14, '0').slice(-14) : (code || '—').toUpperCase();
}

function label(doc, text, x, y) {
  doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(text.toUpperCase(), x, y);
}

function value(doc, text, x, y, width) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text).text(text, x, y, { width, lineGap: 1 });
}

function drawPerforation(doc, x, y, width, bg) {
  const r = 8;
  doc.save();
  doc.fillColor(bg);
  doc.circle(x, y, r).fill();
  doc.circle(x + width, y, r).fill();
  doc.restore();
  doc
    .strokeColor(C.line)
    .lineWidth(1)
    .dash(5, { space: 4 })
    .moveTo(x + r + 2, y)
    .lineTo(x + width - r - 2, y)
    .stroke()
    .undash();
}

async function drawTicketPage(doc, data) {
  const pw = doc.page.width;
  const ph = doc.page.height;
  const x = (pw - W) / 2;
  const y = 64;

  const headerH = 118;
  const posterH = 132;
  const bodyH = 168;
  const qrH = 188;
  const totalH = headerH + posterH + bodyH + qrH;

  const [qrPng, posterBuffer, logoBuffer] = await Promise.all([
    QRCode.toBuffer(`${env.FRONTEND_URL}/admin/verify?t=${data.qrToken}`, {
      width: 280,
      margin: 1,
      color: { dark: C.text, light: C.white },
    }),
    getEventPosterBuffer(data.eventSlug || env.EVENT_SLUG),
    getLogoBuffer(112),
  ]);

  doc.rect(0, 0, pw, ph).fill(C.page);

  doc.save();
  doc.fillColor('#000').opacity(0.05);
  doc.roundedRect(x + 3, y + 4, W, totalH, R).fill();
  doc.restore();

  doc.roundedRect(x, y, W, totalH, R).fill(C.white);

  let cy = y;

  // ── Header: Studio 3 logo with wordmark ──
  const logoW = 104;
  const logoY = cy + 12;
  if (logoBuffer) {
    doc.image(logoBuffer, x + (W - logoW) / 2, logoY, { width: logoW });
  }
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(C.muted)
    .text('ADMISSION TICKET', x, logoY + logoW + 6, { width: W, align: 'center', characterSpacing: 1 });

  doc.strokeColor(C.line).lineWidth(1).moveTo(x + PAD, cy + headerH).lineTo(x + W - PAD, cy + headerH).stroke();
  cy += headerH;

  // ── Poster (clipped, no gradient) ──
  if (posterBuffer) {
    doc.save();
    doc.rect(x, cy, W, posterH).clip();
    doc.image(posterBuffer, x, cy, { width: W, height: posterH, fit: [W, posterH], align: 'center', valign: 'center' });
    doc.restore();
  } else {
    doc.rect(x, cy, W, posterH).fill('#B8C5D6');
  }

  doc.strokeColor(C.line).lineWidth(1).moveTo(x + PAD, cy + posterH).lineTo(x + W - PAD, cy + posterH).stroke();
  cy += posterH;

  // ── Body ──
  const bx = x + PAD;
  const bw = W - PAD * 2;

  doc.font('Helvetica-Bold').fontSize(14).fillColor(C.text).text(data.eventTitle, bx, cy + 16, { width: bw });

  label(doc, 'Member Name', bx, cy + 44);
  value(doc, data.attendeeName, bx, cy + 54, bw);

  if (data.ticketType) {
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(data.ticketType, bx, cy + 72, { width: bw });
  }

  const colW = (bw - 12) / 2;
  const gridY = cy + 88;

  label(doc, 'Date', bx, gridY);
  value(doc, fmtDate(), bx, gridY + 10, colW);

  label(doc, 'Time', bx + colW + 12, gridY);
  value(doc, fmtTime(), bx + colW + 12, gridY + 10, colW);

  label(doc, 'Admit', bx, gridY + 40);
  value(doc, '01 only', bx, gridY + 50, colW);

  label(doc, 'Venue', bx + colW + 12, gridY + 40);
  value(doc, `${data.venue}${data.address ? `, ${data.address}` : ''}`, bx + colW + 12, gridY + 50, colW);

  cy += bodyH;

  // ── Perforation ──
  drawPerforation(doc, x, cy, W, C.page);
  cy += 20;

  // ── QR ──
  const qrSize = 120;
  const box = qrSize + 16;
  const qx = x + (W - box) / 2;

  doc.roundedRect(qx, cy, box, box, 10).strokeColor(C.line).lineWidth(1).stroke();
  doc.image(qrPng, qx + 8, cy + 8, { width: qrSize, height: qrSize });

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(C.text)
    .text(`BOOKING ID — ${fmtBookingId(data.confirmationCode)}`, bx, cy + box + 12, {
      width: bw,
      align: 'center',
      characterSpacing: 0.6,
    });

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(C.muted)
    .text(data.confirmationCode, bx, cy + box + 26, { width: bw, align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(C.muted)
    .text('Present this QR code at the door for entry.', bx, cy + box + 40, { width: bw, align: 'center' });

  if (data.status && data.status !== 'valid') {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#DC2626')
      .text(`STATUS: ${String(data.status).toUpperCase()}`, bx, y + totalH - 16, { width: bw, align: 'center' });
  }

  doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('studio3.dallas', x, ph - 36, { width: W, align: 'center' });
}

export async function generateTicketPdf(data) {
  return generateTicketsPdf([data]);
}

export async function generateTicketsPdf(tickets) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    (async () => {
      for (let i = 0; i < tickets.length; i++) {
        if (i > 0) doc.addPage();
        await drawTicketPage(doc, tickets[i]);
      }
      doc.end();
    })().catch(reject);
  });
}
