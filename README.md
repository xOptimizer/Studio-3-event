# Studio 3 Ticketing API

Node.js (ES modules) backend for Studio 3 event ticketing: Finix payments, implicit registration on checkout, ticket PDFs with QR codes, user profiles, password reset via email OTP, and admin verification.

## Quick start

```bash
cp .env.example .env
# Edit .env with DATABASE_URL, JWT_SECRET, Finix credentials, SMTP

npm install
npm run db:push
npm run db:seed
npm run dev
```

API runs at `http://localhost:3001` by default.

## Authentication

Protected endpoints require a JWT from `POST /auth/login`.

```http
Authorization: Bearer <token>
```

**Login**

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response**

```json
{
  "token": "eyJhbG...",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "phone": "+15550000000",
    "profilePhotoUrl": null,
    "role": "user",
    "createdAt": "2026-03-01T12:00:00.000Z"
  }
}
```

## Endpoints

### Health & checkout

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | Health check |
| POST | `/checkout` | Public | Finix token + buyer info → charge |
| POST | `/webhooks/finix` | Finix signature | Payment webhooks |

**Checkout body**

```json
{
  "token": "TK...",
  "fraudSessionId": "optional",
  "quantity": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+15550000000"
}
```

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | Login → JWT |
| GET | `/auth/me` | JWT | Current user (includes phone, profile photo) |
| POST | `/auth/forgot-password` | Public | Send 6-digit OTP to email |
| POST | `/auth/reset-password` | Public | Reset password with email + OTP + new password |

**Forgot password body**

```json
{ "email": "user@example.com" }
```

**Reset password body**

```json
{ "email": "user@example.com", "otp": "123456", "newPassword": "newpassword123" }
```

OTP expires in 10 minutes. Requires SMTP in production; without SMTP, the code is logged to the API console in development.

### Profile

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profile` | JWT | Full profile (name, email, phone, photo URL) |
| PATCH | `/profile` | JWT | Update phone number |
| POST | `/profile/photo` | JWT | Upload profile photo (`multipart/form-data`, field: `photo`) |
| POST | `/profile/change-password` | JWT | Change password (requires current password) |

**Update phone body**

```json
{ "phone": "+1 (555) 000-0000" }
```

**Change password body**

```json
{ "currentPassword": "oldpass", "newPassword": "newpass123" }
```

Profile photos are stored in `uploads/profiles/` and served at `/uploads/profiles/{userId}.{ext}` (max 5MB; JPEG, PNG, WebP, or GIF).

Name and email are read-only on the profile API (set at checkout / account creation).

### Tickets

Used by the **My Tickets** page in `Studio-3-teaser` to render ticket cards (event details, attendee, QR, booking ID) and download PDF.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tickets` | JWT | List user's paid tickets |
| GET | `/tickets/:id/qr` | JWT | Ticket QR code (PNG image) |
| GET | `/tickets/:id/pdf` | JWT | Download ticket PDF |

**List tickets — `GET /tickets`**

```json
{
  "tickets": [
    {
      "id": "clx123abc",
      "confirmationCode": "SSC-482917",
      "qrToken": "abc123secret",
      "status": "valid",
      "attendeeName": "Maulik Sharma",
      "checkedInAt": null,
      "event": {
        "title": "Inside the Mind of an Artist",
        "venue": "Dec on Dragon",
        "address": "123 Main St, Dallas, TX",
        "startsAt": "2026-03-29T18:00:00.000Z",
        "endsAt": "2026-03-29T23:00:00.000Z"
      },
      "orderId": "clxorder456",
      "amountCents": 4995,
      "quantity": 1
    }
  ]
}
```

**UI field mapping (My Tickets card)**

| UI field | API field |
|----------|-----------|
| Event title | `event.title` |
| Member / attendee name | `attendeeName` |
| Date | `event.startsAt` |
| Time | `event.startsAt` |
| Venue | `event.venue`, `event.address` |
| Booking ID | `confirmationCode` |
| Admit | One ticket per row (`01 only`) |
| Status | `status` — `valid`, `used`, or `cancelled` |

**QR code — `GET /tickets/:id/qr`**

- **Response:** `image/png` (binary)
- QR encodes: `{FRONTEND_URL}/admin/verify?t={qrToken}`

```javascript
const response = await fetch(`${API_URL}/tickets/${ticketId}/qr`, {
  headers: { Authorization: `Bearer ${token}` },
});
const blob = await response.blob();
const qrImageUrl = URL.createObjectURL(blob);
```

**PDF — `GET /tickets/:id/pdf`**

- **Response:** `application/pdf` (binary)
- **Header:** `Content-Disposition: attachment; filename="ticket-{id}.pdf"`

**JPG download**

There is no server endpoint for JPG. The frontend captures the rendered ticket card with `html2canvas` after loading data from `GET /tickets` and the QR from `GET /tickets/:id/qr`.

**Ticket PDF layout**

PDFs use a branded ticket-stub design: Studio 3 logo, event poster banner, attendee details, perforated divider, QR code, and booking ID.

Add event poster artwork (optional):

- **Default poster:** `assets/posters/art_gallery_poster.png` (already included)
- Per-event override: `assets/posters/{event-slug}.jpg` (e.g. `inside-the-mind-2026.jpg`)
- Or set `EVENT_POSTER_URL` in `.env` to a public image URL
- Fallback: branded gradient banner with event title

Logo assets live in `assets/logo-with-text.svg` and `assets/logo-mark.svg`.

**curl examples**

```bash
# Login and save token
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"yourpassword"}' \
  | jq -r '.token')

# List tickets
curl -s http://localhost:3001/tickets \
  -H "Authorization: Bearer $TOKEN" | jq

# Download QR (replace TICKET_ID)
curl -s http://localhost:3001/tickets/TICKET_ID/qr \
  -H "Authorization: Bearer $TOKEN" \
  -o ticket-qr.png

# Download PDF
curl -s http://localhost:3001/tickets/TICKET_ID/pdf \
  -H "Authorization: Bearer $TOKEN" \
  -o ticket.pdf
```

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/admin/tickets/verify` | Admin JWT | Verify QR token |
| POST | `/admin/tickets/check-in` | Admin JWT | Mark ticket used |
| GET | `/admin/orders` | Admin JWT | Order list |

**Verify body**

```json
{ "qrToken": "abc123secret" }
```

## Environment

See `.env.example`. Required: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, Finix sandbox credentials.

For ticket emails and password-reset OTPs, configure SMTP:

```bash
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=tickets@studio3.dallas
```

Optional — event poster on ticket PDFs: default is `assets/posters/art_gallery_poster.png`; override with `assets/posters/{event-slug}.jpg` or `EVENT_POSTER_URL`.

## Frontend

The React teaser site (`Studio-3-teaser`) calls this API via `VITE_API_URL`.

Frontend env (`.env` in `Studio-3-teaser`):

```bash
VITE_API_URL=http://localhost:3001
VITE_FINIX_APPLICATION_ID=
VITE_FINIX_ENV=sandbox
```

| Route | Description |
|-------|-------------|
| `/profile` | Profile photo, phone edit, change password |
| `/tickets` | My Tickets — ticket card UI, QR display, JPG + PDF download |
| `/event/checkout` | Finix checkout flow |

Login modal includes forgot-password flow (OTP endpoints above).

## Deployment

- **API:** Railway, Render, or Fly.io with PostgreSQL
- Set `FRONTEND_URL` to production Vercel URL for CORS
- Register webhook: `https://your-api.com/webhooks/finix`
- Configure SMTP for production password resets and ticket emails
- Profile photo uploads use local disk (`uploads/`). For ephemeral hosts, use persistent storage or swap to object storage (S3, etc.)

See `docs/ARCHITECTURE.md` for full system design.
