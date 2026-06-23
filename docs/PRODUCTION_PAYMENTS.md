# Production Payment Setup — Studio 3 Ticketing

This guide covers everything required to accept **real payments** in production for Studio 3 event ticketing. The stack uses **Finix** for card, Apple Pay, and Google Pay processing.

**Repos involved**

| Repo | Role |
|------|------|
| `studio-3-ticketing-api` (this repo) | Charges cards/wallets, fulfills orders, sends ticket emails |
| `Studio-3-teaser` | Checkout UI, Finix.js tokenization, Apple Pay / Google Pay buttons |

---

## How payments work today

```
Buyer (frontend)                    API (backend)                    Finix
     │                                   │                              │
     │  Card: Finix.js → token           │                              │
     │  Apple/Google Pay → wallet token  │                              │
     │──────── POST /checkout ──────────►│── Identity → Instrument ────►│
     │                                   │◄── Transfer (SUCCEEDED) ─────│
     │◄────── success + orderId ─────────│                              │
     │                                   │── create user, tickets, email│
     │                                   │                              │
     │                                   │◄── webhook (if PENDING) ─────│
     │                                   │── fulfillOrder on SUCCEEDED  │
```

**Two fulfillment paths**

1. **Immediate** — Transfer returns `SUCCEEDED` during `POST /checkout`. Tickets and email are sent right away. Most card payments follow this path.
2. **Async (webhook)** — Transfer is `PENDING` at checkout time. Finix later POSTs to `/webhooks/finix` when the transfer succeeds. The webhook handler then creates tickets and sends email.

Both paths are idempotent — duplicate webhooks or retries will not double-fulfill an order.

---

## Pre-launch checklist

Use this as a go-live checklist. Do not skip items marked **Required**.

### Finix account

- [ ] **Required** — Complete Finix merchant onboarding (KYC/business verification) for production
- [ ] **Required** — Merchant account status is `APPROVED` in the Finix Dashboard
- [ ] **Required** — Create **production** API credentials (separate from sandbox)
- [ ] **Required** — Note your production `Merchant Identity ID` (`ID…` prefix)
- [ ] **Required** — Note your production `Application ID` (`AP…` prefix, used by Finix.js on frontend)
- [ ] Confirm statement descriptor / business name shown on buyer card statements

### API deployment (`studio-3-ticketing-api`)

- [ ] **Required** — Deploy API to a stable HTTPS host (e.g. Railway, Render, Fly.io)
- [ ] **Required** — Set all production environment variables (see [Backend environment variables](#backend-environment-variables))
- [ ] **Required** — Set `FINIX_ENV=prod`
- [ ] **Required** — Set `FRONTEND_URL` to your live frontend URL (CORS)
- [ ] **Required** — PostgreSQL database reachable from the API host
- [ ] **Required** — Run `npm run db:push` (or migrations) against production DB
- [ ] **Required** — Run `npm run db:seed` once to create admin user and event (or insert event manually)
- [ ] **Required** — Register production webhook (see [Webhooks](#webhooks))
- [ ] **Required** — Set `FINIX_WEBHOOK_SECRET` from Finix after webhook creation
- [ ] **Required** — Configure SMTP for ticket and password-reset emails
- [ ] Verify `GET https://your-api.com/health` returns `200`
- [ ] Verify `GET https://your-api.com/checkout/config` returns production `merchantIdentityId`

### Frontend deployment (`Studio-3-teaser`)

- [ ] **Required** — Deploy to HTTPS (e.g. Vercel)
- [ ] **Required** — Set `VITE_API_URL` to production API URL
- [ ] **Required** — Set `VITE_FINIX_APPLICATION_ID` to production Application ID
- [ ] **Required** — Set `VITE_FINIX_ENV=live` (or `prod`, matching your Finix.js integration)
- [ ] Checkout page loads Finix.js in **live** mode (not sandbox)
- [ ] Test a full purchase end-to-end on production with a real card (small amount or refund after)

### Apple Pay (optional but recommended)

- [ ] Register production checkout domain in Finix Dashboard → Developer → Alt Payment Methods
- [ ] Host Apple domain verification file on frontend at `/.well-known/apple-developer-merchantid-domain-association`
- [ ] Apple Pay button only appears on Safari with a card in Wallet (expected behavior)
- [ ] Test on a real iPhone/Mac in Safari

### Google Pay (optional but recommended)

- [ ] Register with [Google Pay Business Console](https://pay.google.com/business/console) for production access
- [ ] Set Google Pay `environment: "PRODUCTION"` in frontend (was `"TEST"` in sandbox)
- [ ] Provide production `merchantId` from Google in the Google Pay payment request
- [ ] Test in Chrome with a saved card

### Security

- [ ] **Required** — `JWT_SECRET` is a long random string (32+ chars), unique to production
- [ ] **Required** — Finix API password and webhook secret are only in server env vars, never in frontend or git
- [ ] **Required** — `.env` is not committed to git
- [ ] Remove or disable ngrok / sandbox webhook URLs from Finix production account
- [ ] Admin password from seed is changed after first login

---

## Backend environment variables

Set these on your production API host.

| Variable | Required | Production value |
|----------|----------|------------------|
| `DATABASE_URL` | Yes | Production PostgreSQL connection string |
| `JWT_SECRET` | Yes | Long random secret, unique to prod |
| `FRONTEND_URL` | Yes | `https://your-frontend.vercel.app` (no trailing slash) |
| `FINIX_ENV` | Yes | `prod` |
| `FINIX_API_USERNAME` | Yes | Production API username from Finix Dashboard |
| `FINIX_API_PASSWORD` | Yes | Production API password from Finix Dashboard |
| `FINIX_MERCHANT_IDENTITY_ID` | Yes | Production Merchant Identity ID (`ID…`) |
| `FINIX_MERCHANT_DISPLAY_NAME` | Yes | Name shown on Apple Pay / Google Pay (e.g. `Studio 3`) |
| `FINIX_WEBHOOK_SECRET` | Yes | Signing secret from production webhook registration |
| `SMTP_HOST` | Yes | Production mail provider hostname |
| `SMTP_PORT` | Yes | Usually `587` |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password or app password |
| `EMAIL_FROM` | Yes | e.g. `tickets@studio3.dallas` (must be allowed by your SMTP provider) |
| `EVENT_SLUG` | Yes | Slug of the event being sold (default: `inside-the-mind-2026`) |
| `PORT` | No | Host sets this automatically on Railway/Render |

**What changes from sandbox → production**

```diff
- FINIX_ENV=sandbox
+ FINIX_ENV=prod

- FINIX_API_USERNAME=<sandbox username>
+ FINIX_API_USERNAME=<production username>

- FINIX_API_PASSWORD=<sandbox password>
+ FINIX_API_PASSWORD=<production password>

- FINIX_MERCHANT_IDENTITY_ID=<sandbox merchant identity>
+ FINIX_MERCHANT_IDENTITY_ID=<production merchant identity>

- FRONTEND_URL=http://localhost:5173
+ FRONTEND_URL=https://your-live-site.com

+ FINIX_WEBHOOK_SECRET=<from production webhook>
```

Finix API base URL switches automatically when `FINIX_ENV=prod`:

- Sandbox: `https://finix.sandbox-payments-api.com`
- Production: `https://finix.live-payments-api.com`

---

## Frontend environment variables

Set these in Vercel (or your frontend host) for `Studio-3-teaser`.

| Variable | Required | Production value |
|----------|----------|------------------|
| `VITE_API_URL` | Yes | `https://your-api.railway.app` |
| `VITE_FINIX_APPLICATION_ID` | Yes | Production Application ID (`AP…`) |
| `VITE_FINIX_ENV` | Yes | `live` |

The frontend can also call `GET /checkout/config` at runtime to read `merchantIdentityId`, event price, and supported payment methods — useful for Apple Pay and Google Pay setup.

---

## Webhooks

Webhooks are **required in production**. They cover async transfers and act as a safety net if checkout fulfillment fails mid-request.

### Register the production webhook

1. Log in to the **production** Finix Dashboard (not sandbox).
2. Go to **Developer → Webhooks → Create Webhook**.
3. Set the URL:

   ```
   https://your-api-domain.com/webhooks/finix
   ```

4. **Authentication:** None (your API verifies the `Finix-Signature` header, not Basic auth).
5. **Events to subscribe:**
   - `transfer` → `created`
   - `transfer` → `updated`
6. Copy the **webhook signing secret** Finix provides.
7. Set it as `FINIX_WEBHOOK_SECRET` on the API and redeploy.

### Verify the webhook works

```bash
# Health check through production API
curl https://your-api-domain.com/health

# After a test purchase, check Finix Dashboard → Webhooks → delivery logs
# Or inspect API logs for: [webhook] Missing tags / fulfillment messages
```

### Remove sandbox / ngrok webhooks

Before go-live, disable or delete any webhooks pointing to:

- `https://*.ngrok-free.dev/webhooks/finix`
- localhost URLs

These were for local development only.

---

## Payment methods

### Card (Finix.js)

**Sandbox (dev)**

- Use Finix sandbox test cards (e.g. `4111111111111111`).
- `VITE_FINIX_ENV=sandbox`, `FINIX_ENV=sandbox`.

**Production**

- Finix.js loads in live mode with production `VITE_FINIX_APPLICATION_ID`.
- Card data is tokenized in the browser; only the token is sent to `POST /checkout`.
- Real cards are charged; use a small test purchase and refund via Finix Dashboard if needed.

### Apple Pay

**Finix Dashboard setup**

1. Developer → Alt Payment Methods → Add Web Domain.
2. Enter your production frontend domain (e.g. `studio3.dallas` or `www.studio3.dallas`).
3. Download the verification file Finix generates.
4. Host it on the **frontend** site at:

   ```
   https://your-domain.com/.well-known/apple-developer-merchantid-domain-association
   ```

5. Complete domain verification in Finix (do not click Submit until the file is live).

**Frontend flow**

1. Load Apple Pay JS SDK.
2. On `onvalidatemerchant`, call `POST /checkout/apple-pay-session` with `{ validationUrl, domain }`.
3. Parse `sessionDetails` from the response and call `completeMerchantValidation()`.
4. On `onpaymentauthorized`, POST to `/checkout` with `paymentMethod: "apple_pay"`.

**Production notes**

- Apple Pay only works on Safari (macOS/iOS) with a card in Apple Wallet.
- Use the production `merchantIdentityId` from `GET /checkout/config`.
- `FINIX_MERCHANT_DISPLAY_NAME` is shown on the Apple Pay sheet.

### Google Pay

**Google setup**

1. Create a [Google Pay Business Console](https://pay.google.com/business/console) merchant account.
2. Complete Google's production access review.
3. Obtain your production Google `merchantId`.

**Frontend changes for production**

```javascript
// Sandbox
environment: "TEST"

// Production
environment: "PRODUCTION"
```

Tokenization spec (unchanged):

```javascript
{
  type: "PAYMENT_GATEWAY",
  parameters: {
    gateway: "finix",
    gatewayMerchantId: "<merchantIdentityId from GET /checkout/config>",
  },
}
```

Pass the token from `paymentMethodData.tokenizationData.token` to `POST /checkout` with `paymentMethod: "google_pay"`.

---

## Email (ticket delivery)

Checkout fulfillment sends:

- **New buyers** — auto-generated password + ticket PDF with QR
- **Returning buyers** — ticket PDF only (existing login)

Without SMTP, emails are not sent and buyers will not receive tickets even if payment succeeds.

**Recommended providers:** SendGrid, Postmark, Amazon SES, or your domain host's SMTP.

**Verify before launch**

1. Set all `SMTP_*` vars on the API.
2. Complete a test purchase with your own email.
3. Confirm ticket PDF arrives within a few minutes.
4. Test password-reset OTP email (`POST /auth/forgot-password`).

---

## Testing before go-live

Run these tests in order on **production** infrastructure (with real credentials, small amounts).

| # | Test | Expected result |
|---|------|-----------------|
| 1 | `GET /health` | `{ "status": "ok" }` |
| 2 | `GET /checkout/config` | Returns prod `merchantIdentityId`, event price |
| 3 | Card checkout — 1 ticket | Payment succeeds, email with PDF, ticket in My Tickets |
| 4 | Same email — 2nd purchase | No new password email; new ticket linked to same account |
| 5 | Webhook delivery (Finix Dashboard) | 200 responses for transfer events |
| 6 | Admin QR verify + check-in | Ticket scans and marks as used |
| 7 | Apple Pay (Safari) | Payment succeeds, ticket emailed |
| 8 | Google Pay (Chrome) | Payment succeeds, ticket emailed |
| 9 | Sold-out edge case | Checkout rejected with 409 if capacity exceeded |

**Refund a test charge**

Finix Dashboard → Transfers → find the test transfer → issue reversal/refund as supported by your Finix plan.

---

## Monitoring after launch

### Finix Dashboard

- **Transfers** — all charges, states, failures
- **Webhooks** — delivery status, retries, failures
- **Disputes** — chargebacks (respond promptly)

### API logs

Watch for:

```
[checkout] Finix API error ...
[webhook] Missing tags for transfer ...
[webhook] Capacity exceeded after successful payment — manual refund may be required
```

The capacity-exceeded webhook log means payment succeeded but inventory ran out — **manual refund required**.

### Health

- Uptime monitor on `GET /health`
- Alert on repeated `5xx` from `/checkout` or `/webhooks/finix`

---

## Common production issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Checkout returns 500, Finix auth error | Wrong prod API credentials or `FINIX_ENV` still `sandbox` | Update env vars, redeploy |
| CORS error on frontend | `FRONTEND_URL` mismatch | Set exact production frontend origin |
| Payment succeeds, no ticket email | SMTP not configured | Set `SMTP_*` vars |
| Webhook 401 | Wrong `FINIX_WEBHOOK_SECRET` | Re-copy secret from Finix, redeploy |
| Apple Pay button missing | Domain not verified, or not Safari | Complete Finix domain registration + host verification file |
| Google Pay fails in prod | Still using `TEST` environment or missing Google merchantId | Switch to `PRODUCTION`, add Google merchant ID |
| Finix.js tokenization fails | Frontend still using sandbox Application ID | Set production `VITE_FINIX_APPLICATION_ID` |
| Double tickets | Should not happen (idempotent fulfillment) | Check logs; contact dev if it does |

---

## Dev vs production — keep them separate

| | Development | Production |
|---|-------------|------------|
| Finix | Sandbox credentials | Production credentials |
| Webhook URL | ngrok tunnel | `https://api.yourdomain.com/webhooks/finix` |
| Frontend | `localhost:5173` | Vercel production URL |
| Cards | Test card numbers | Real cards |
| Apple Pay domain | ngrok (limited) | Registered production domain |
| Google Pay | `environment: "TEST"` | `environment: "PRODUCTION"` |
| Email | Console log / optional SMTP | Production SMTP required |

Never point production Finix webhooks at ngrok. Never use sandbox API keys on the production API.

---

## Quick reference — API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/checkout/config` | Wallet + event config for frontend |
| `POST` | `/checkout` | Process card, Apple Pay, or Google Pay payment |
| `POST` | `/checkout/apple-pay-session` | Apple Pay merchant validation |
| `POST` | `/webhooks/finix` | Async payment fulfillment |
| `GET` | `/health` | Uptime check |

---

## Support contacts

- **Finix support** — for merchant approval, disputes, payout questions, Apple Pay domain issues
- **Google Pay** — [Google Pay support](https://developers.google.com/pay/api/web/support) for production API access
- **Apple Pay** — domain verification issues via Finix Dashboard + Apple Developer account

---

## Related docs

- [README.md](../README.md) — API endpoints and env reference
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design and payment flow
- [Finix Digital Wallets](https://docs.finix.com/guides/online-payments/digital-wallets)
- [Finix Webhooks](https://docs.finix.com/additional-resources/developers/webhooks/integrating-into-webhooks)
