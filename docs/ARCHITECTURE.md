# Studio 3 Ticketing — Architecture

Two-repo design (backend lives in `studio-3-ticketing-api/` inside this monorepo; can be split to its own git repo).

## Flow

1. User fills checkout form + Finix.js card form on Event page
2. `POST /checkout` with token → Finix Identity → Payment Instrument → Transfer
3. On `SUCCEEDED`: create user (auto password for new emails), order, tickets with QR tokens
4. Email via Nodemailer: password (new users) + PDF ticket(s) with QR
5. User logs in → My Tickets
6. Admin scans QR on ticket → verify + check-in APIs

## Finix

- **Finix.js** (frontend): tokenizes card data
- **Finix API** (backend): charges card; secrets never in React
- **Webhooks**: `transfer` events with `SUCCEEDED` for async fulfillment

## Auth

No public register endpoint. Checkout creates accounts. Admin seeded via `npm run db:seed`.

## QR

Each ticket has unique `qrToken`. QR encodes `{FRONTEND_URL}/admin/verify?t={qrToken}`.
