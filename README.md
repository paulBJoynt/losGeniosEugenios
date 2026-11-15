# losGeniosEugenios — CoDi payment alerts on WhatsApp

A stall merchant shows a preset CoDi QR. When a customer pays it, the merchant gets a WhatsApp
message with the amount and their running total for the day.

Product scope and decisions: [docs/PRD.md](docs/PRD.md).

## How it works

1. The `/setup` page creates a non-expiring CoDi QR in Pey and links it to the merchant's phone.
2. The merchant sends `Hola` to the WhatsApp number. This opens 24 hours of free-form alerts.
3. A customer pays the QR. Pey calls `POST /api/pey/webhook`.
4. The app verifies the signature, stores the payment once, and sends the alert on WhatsApp.

| Path | Purpose |
|---|---|
| `app/api/pey/webhook` | Pey payment events (Standard Webhooks signature) |
| `app/api/whatsapp/webhook` | Inbound WhatsApp messages (Meta, or Twilio as plan B) |
| `app/setup` | Page to create a merchant's QR and simulate a payment (needs `ADMIN_SECRET`) |
| `app/api/admin/create-qr`, `app/api/mock/payment` | Back the setup page; disabled without `ADMIN_SECRET` |
| `lib/whatsapp.ts` | The only file that talks to WhatsApp; `WHATSAPP_PROVIDER` picks Meta or Twilio |
| `scripts/create-qr.ts` | Creates the QR and the merchant record |
| `scripts/smoke-test.ts` | Runs the whole loop locally with no external services |

## Setup

### 1. Database

Create a Postgres database (Neon, from the Vercel Storage tab) and copy its connection string
into `DATABASE_URL`. Tables are created automatically on first use.

### 2. WhatsApp (Meta Cloud API)

In developers.facebook.com, open your app → WhatsApp → API Setup.

1. Copy the **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID` and the access token into
   `WHATSAPP_TOKEN`. The token on that page lasts about 24 hours; generate a fresh one on demo day.
2. Add the merchant's phone to the recipient list ("To" field) and confirm the code.
3. Copy App settings → Basic → **App secret** into `META_APP_SECRET`.
4. Invent a string for `WHATSAPP_VERIFY_TOKEN`.
5. After deploying, go to WhatsApp → Configuration → Webhook → Edit. Callback URL:
   `https://<your-app>.vercel.app/api/whatsapp/webhook`. Verify token: the same string.
   Then subscribe to the `messages` field.

Plan B is the Twilio sandbox: set `WHATSAPP_PROVIDER=twilio`, fill the `TWILIO_*` variables and
`PUBLIC_BASE_URL`, and point Twilio's "When a message comes in" at the same webhook URL.

### 3. Deploy

Import the repository in Vercel and set the variables from `.env.example`.

### 4. Pey webhook

In https://portal.mipey.mx/developers click the gear on your API key, set the webhook URL to
`https://<your-app>.vercel.app/api/pey/webhook`, and copy the secret (shown once) into
`PEY_WEBHOOK_SECRET`. Redeploy after adding it.

### 5. Create the QR

Open `https://<your-app>.vercel.app/setup`, enter the `ADMIN_SECRET` you set in Vercel, the stall
name, the merchant's WhatsApp number and the amount, and press "Crear QR". The page shows the QR;
screenshot or print it.

The same thing from a terminal, with `PEY_API_KEY` and `DATABASE_URL` in a local `.env`:

```bash
npm run create-qr -- --phone +52XXXXXXXXXX --name "Tacos Lupita" --amount 0.01 --concept "Tacos"
```

## Demo script

1. Merchant sends `Hola` to the WhatsApp number.
2. Payer scans the QR with their bank app and pays $0.01.
3. The merchant's phone shows `✅ Recibiste $0.01 MXN — Tacos. Llevas $0.01 hoy (1 pago).`
4. Pay again; the total goes up.

Fallback if a live payment fails on stage: the "Simular un pago" button on `/setup`, shown after
creating the QR. It sends the same alert without a bank payment.

## Local checks

```bash
npm run smoke
```

```bash
npm run typecheck
```

## Not verified yet

- That one Pey QR can be paid more than once. Pay the demo QR twice before relying on it.
- That the payer's bank app accepts a $0.01 CoDi payment.
- The real Pey webhook payload against production (the handler follows Pey's documented example).
