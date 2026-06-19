# Studio 3 Ticketing API

Node.js (ES modules) backend for Studio 3 event ticketing: Finix payments, implicit registration on checkout, ticket PDFs with QR codes, admin verification.

## Quick start

```bash
cd studio-3-ticketing-api
cp .env.example .env
# Edit .env with DATABASE_URL, JWT_SECRET, Finix credentials, SMTP

npm install
npx prisma db push
npm run db:seed
npm run dev
```

API runs at `http://localhost:3001` by default.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | Health check |
| POST | `/checkout` | Public | Finix token + buyer info → charge |
| POST | `/webhooks/finix` | Finix signature | Payment webhooks |
| POST | `/auth/login` | Public | Login → JWT |
| GET | `/auth/me` | JWT | Current user |
| GET | `/tickets` | JWT | User's tickets |
| GET | `/tickets/:id/pdf` | JWT | Download ticket PDF |
| POST | `/admin/tickets/verify` | Admin JWT | Verify QR token |
| POST | `/admin/tickets/check-in` | Admin JWT | Mark ticket used |
| GET | `/admin/orders` | Admin JWT | Order list |

## Environment

See `.env.example`. Required: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, Finix sandbox credentials.

## Frontend

The React teaser site (`Studio-3-teaser`) calls this API via `VITE_API_URL`.

## Deployment

- **API:** Railway, Render, or Fly.io with PostgreSQL
- Set `FRONTEND_URL` to production Vercel URL for CORS
- Register webhook: `https://your-api.com/webhooks/finix`

See `docs/ARCHITECTURE.md` for full system design.
