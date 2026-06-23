# Studio 3 Ticketing — Architecture

Two-repo design (backend lives in `studio-3-ticketing-api/` inside this monorepo; can be split to its own git repo).

## Flow

1. User fills checkout form + Finix.js card form (or Apple Pay / Google Pay buttons) on Event page
2. `POST /checkout` with card token or wallet `thirdPartyToken` → Finix Identity → Payment Instrument → Transfer
3. On `SUCCEEDED`: create user (auto password for new emails), order, tickets with QR tokens
4. Email via Nodemailer: password (new users) + PDF ticket(s) with QR
5. User logs in → My Tickets
6. Admin scans QR on ticket → verify + check-in APIs

## Finix

- **Finix.js** (frontend): tokenizes card data
- **Apple Pay / Google Pay** (frontend): wallet tokens sent to `POST /checkout`; Apple Pay merchant validation via `POST /checkout/apple-pay-session`
- **Finix API** (backend): charges card or wallet; secrets never in React
- **Webhooks**: `transfer` events with `SUCCEEDED` for async fulfillment

## Auth

No public register endpoint. Checkout creates accounts with a generated password and `mustChangePassword: true`. On first login, the client must call `POST /auth/set-password` before tickets/profile APIs. Admin seeded via `npm run db:seed`.

## QR

Each ticket has unique `qrToken`. QR encodes `{FRONTEND_URL}/admin/verify?t={qrToken}`.
