import { getEventDateTimeLabel } from '../constants/eventDisplay.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatEventDateTimeRange() {
  return getEventDateTimeLabel();
}

const WELCOME_PARAGRAPHS_PAID = [
  "Your ticket is attached. But before you get there, you should know what you're walking into.",
  'Studio 3 is built around a simple belief: discovering art should feel like an experience. A real experience where you find work that stops you, learn the story behind it, and actually own a piece of it.',
  "We're building a space for artists and the people who love what they make. A platform where artists share what they make, how they make it, and do so on their own terms. Where collectors find work that means something. Where the distance between a painting on a wall and the person who made it no longer exists.",
  "On July 25, we're inviting you in for the first time. Inside the Mind of an Artist is an immersive installation experience featuring ten artists doing some of the most interesting creative work in Dallas right now. You'll move through their worlds, hear the music that makes rooms come alive, and spend a night inside the kind of creative energy that's hard to find and harder to forget. This is the world we're building, and this event is your first look inside it.",
  "On July 25, you'll get your first look at what we're building, including an early demo of the Studio 3 app. Our creative home is coming soon. But the night starts here.",
];

const WELCOME_PARAGRAPHS_COMPLIMENTARY = [
  "Your complimentary pass is attached. Before you arrive, here's what you're walking into.",
  'Studio 3 is built around a simple belief: discovering art should feel like an experience — where you find work that stops you, learn the story behind it, and actually own a piece of it.',
  "On July 25, we're opening the doors for the first time with Inside the Mind of an Artist — an immersive installation experience featuring ten artists doing some of the most interesting creative work in Dallas right now. You'll move through their worlds and spend a night inside the kind of creative energy that's hard to find and harder to forget.",
  "You'll also get an early look at what we're building, including a demo of the Studio 3 app. Our creative home is coming soon. The night starts here.",
];

function buildWelcomeParagraphs(isComplimentary) {
  return isComplimentary ? WELCOME_PARAGRAPHS_COMPLIMENTARY : WELCOME_PARAGRAPHS_PAID;
}

function buildTicketLinesText(tickets) {
  if (!tickets?.length) return '';

  return tickets
    .map((ticket, index) => {
      const prefix = tickets.length > 1 ? `Ticket ${index + 1}\n` : '';
      return `${prefix}  Attendee: ${ticket.attendeeName}\n  Confirmation code: ${ticket.confirmationCode}`;
    })
    .join('\n\n');
}

function buildTicketLinesHtml(tickets) {
  if (!tickets?.length) return '';

  return tickets
    .map((ticket, index) => {
      const heading = tickets.length > 1 ? `<p style="margin:16px 0 6px;font-weight:700;color:#111827;">Ticket ${index + 1}</p>` : '';
      return `${heading}
        <p style="margin:0 0 4px;color:#4B5563;font-size:14px;line-height:1.5;">
          <strong style="color:#111827;">Attendee:</strong> ${escapeHtml(ticket.attendeeName)}
        </p>
        <p style="margin:0;color:#4B5563;font-size:14px;line-height:1.5;">
          <strong style="color:#111827;">Confirmation code:</strong> ${escapeHtml(ticket.confirmationCode)}
        </p>`;
    })
    .join('');
}

function buildLoginSectionText({ to, isNewUser, plainPassword, siteUrl }) {
  if (isNewUser && plainPassword) {
    return `Your account has been created. Log in to view your tickets anytime:

Email: ${to}
Password: ${plainPassword}

Login: ${siteUrl}`;
  }

  return `You can log in with your existing Studio 3 account to view your tickets:

${siteUrl}`;
}

function buildLoginSectionHtml({ to, isNewUser, plainPassword, siteUrl }) {
  if (isNewUser && plainPassword) {
    return `
      <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.65;">
        Your account has been created. Log in to view your tickets anytime:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;margin:0 0 16px;">
        <tr>
          <td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#374151;">
            <p style="margin:0 0 8px;"><strong style="color:#111827;">Email:</strong> ${escapeHtml(to)}</p>
            <p style="margin:0;"><strong style="color:#111827;">Password:</strong> ${escapeHtml(plainPassword)}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0;">
        <a href="${escapeHtml(siteUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">
          Log in to Studio 3
        </a>
      </p>`;
  }

  return `
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.65;">
      You can log in with your existing Studio 3 account to view your tickets:
    </p>
    <p style="margin:0;">
      <a href="${escapeHtml(siteUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">
        View my tickets
      </a>
    </p>`;
}

export function buildTicketDeliveryEmailContent(params) {
  const {
    name,
    to,
    eventTitle,
    venue,
    address,
    startsAt,
    endsAt,
    tickets = [],
    isNewUser,
    plainPassword,
    isComplimentary = false,
    siteUrl,
    hasBanner = false,
  } = params;

  const intro = isComplimentary
    ? `You've received a complimentary pass for ${eventTitle}.`
    : `Thank you for your purchase for ${eventTitle}.`;

  const welcomeParagraphs = buildWelcomeParagraphs(isComplimentary);
  const whenLine = formatEventDateTimeRange();
  const loginText = buildLoginSectionText({ to, isNewUser, plainPassword, siteUrl });
  const loginHtml = buildLoginSectionHtml({ to, isNewUser, plainPassword, siteUrl });
  const ticketText = buildTicketLinesText(tickets);
  const ticketHtml = buildTicketLinesHtml(tickets);

  const text = [
    `Hi ${name},`,
    '',
    intro,
    '',
    ...welcomeParagraphs,
    '',
    '________________________________________________________________________________________________________________________________________________________________________________________________________________________________________',
    '',
    'Event details:',
    eventTitle,
    venue ? `Venue: ${venue}` : null,
    address ? `Address: ${address}` : null,
    whenLine ? `Date: ${whenLine}` : null,
    ticketText ? `\nYour ticket${tickets.length > 1 ? 's' : ''}:\n${ticketText}` : null,
    '',
    'Your ticket(s) are attached as a PDF. Each ticket includes a QR code for entry at the door.',
    '',
    loginText,
    '',
    "We're glad you're part of it.",
    '— The Studio 3 Team',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const welcomeHtml = welcomeParagraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">${escapeHtml(paragraph)}</p>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Studio 3 — ${escapeHtml(eventTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F4F6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #E5E7EB;box-shadow:0 12px 40px rgba(17,24,39,0.08);">
          ${
            hasBanner
              ? `<tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <img src="cid:studio3-ticket-banner" alt="Inside the Mind of an Artist — Studio 3" width="620" style="display:block;width:100%;max-width:620px;height:auto;border:0;" />
            </td>
          </tr>`
              : `<tr>
            <td style="padding:28px 32px 8px;background:linear-gradient(135deg,#FFD54F 0%,#FF9800 32%,#FF6D00 68%,#E65100 100%);">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.92);">Studio 3</p>
              <h1 style="margin:8px 0 0;font-size:28px;line-height:1.15;color:#ffffff;">${escapeHtml(eventTitle)}</h1>
            </td>
          </tr>`
          }
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#111827;">Hi ${escapeHtml(name)},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(intro)}</p>
              ${welcomeHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <div style="height:1px;background:#E5E7EB;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 0;">
              <h2 style="margin:0 0 16px;font-size:13px;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:#6B7280;">Event details</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:16px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 10px;font-size:18px;line-height:1.35;font-weight:800;color:#111827;">${escapeHtml(eventTitle)}</p>
                    ${venue ? `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#4B5563;"><strong style="color:#111827;">Venue:</strong> ${escapeHtml(venue)}</p>` : ''}
                    ${address ? `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#4B5563;"><strong style="color:#111827;">Address:</strong> ${escapeHtml(address)}</p>` : ''}
                    ${whenLine ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#4B5563;"><strong style="color:#111827;">Date:</strong> ${escapeHtml(whenLine)}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            tickets.length
              ? `<tr>
            <td style="padding:28px 32px 0;">
              <h2 style="margin:0 0 16px;font-size:13px;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:#6B7280;">Your ticket${tickets.length > 1 ? 's' : ''}</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid #E5E7EB;border-radius:16px;">
                <tr>
                  <td style="padding:18px 20px;">
                    ${ticketHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
              : ''
          }
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">
                Your ticket(s) are attached as a PDF. Each ticket includes a QR code for entry at the door.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 0;">
              ${loginHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 36px;">
              <p style="margin:0 0 8px;color:#111827;font-size:15px;line-height:1.7;font-weight:600;">We're glad you're part of it.</p>
              <p style="margin:0;color:#6B7280;font-size:14px;line-height:1.6;">— The Studio 3 Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}
