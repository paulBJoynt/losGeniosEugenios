# Build plan: setup and work split

Status: v2, 2026-11-15. Companion to [PRD.md](PRD.md). Target: all P0 items by the Nov 15 kickoff submission.

## 1. How the system fits together

The system is a pipeline: **Pey (bank side) → our app → WhatsApp (Meta)**.

| Piece | What it is | Setup needed |
|---|---|---|
| App | Next.js (TypeScript) API routes, hosted on Vercel | Node.js on both laptops; a Vercel project connected to this GitHub repo |
| Database | Postgres on Neon, added through Vercel. Tables `merchants` and `payments` (see PRD §8) | Add Neon from the Vercel dashboard; it sets `DATABASE_URL` |
| Pey | CoDi API. Creates the QR and calls our webhook (signed using the Standard Webhooks format) when someone pays | API key is ready. Set the webhook URL in the Pey portal. The signing secret is shown only once, so save it immediately |
| WhatsApp | Meta Cloud API with a test number | Team lead creates the Meta app, adds the test number and the demo phone as a test recipient, and sets the webhook URL and verify token |

### Environment variables

`PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `DATABASE_URL`

Store them in Vercel project settings. Pull them to a laptop with `vercel env pull .env.local`. Do not paste them in chat or commit them.

### Things that will catch you out

- **Webhooks need a public, fixed URL.** Pey allows one webhook URL per API key, and Meta also wants a fixed one. Point both at the Vercel production URL and test by merging and deploying, not from localhost.
- **Meta's default access token expires in about 24 hours.** Generate a fresh one on demo day, or create a system-user token.

## 2. Current state (Nov 15)

The first version of both sides is built and pushed on `claude/festive-cerf-droyo6`. What is left is setup and live testing, not code.

| Area | Where it lives |
|---|---|
| Payments | `lib/pey.ts`, `lib/payments.ts`, `lib/store.ts`, `app/api/pey/webhook` |
| WhatsApp | `lib/whatsapp.ts` (`sendWhatsApp(to, body)`), `app/api/whatsapp/webhook` |
| Onboarding | `app/setup` page, `app/api/admin/create-qr`, `scripts/create-qr.ts` |
| Stage fallback | `app/api/mock/payment`, used by the "Simular un pago" button on `/setup` |
| Checks | `npm run smoke` (whole loop, no external services), `npm run typecheck` |

Environment variables now also include `META_APP_SECRET` (verifies Meta webhooks) and `ADMIN_SECRET` (protects `/setup`). Full list: `.env.example`.

Tested only locally so far. Still to prove against real services: the Postgres queries, a real Pey webhook, a real Meta send, and paying one QR twice.

### Remaining work

| Step | Owner |
|---|---|
| Import the repo in Vercel, add Neon, set env vars | Team lead |
| Set the Pey webhook URL and save its secret | Team lead |
| Set the Meta webhook URL and subscribe to `messages` | Team lead |
| Create the QR on `/setup`, send `Hola`, pay twice from Nu | Team lead |
| Fix whatever the live test breaks | Whoever is free |

## 3. Original work split (superseded)



The split is by side of the pipeline, not first half / second half: each step depends on the previous one, so a chronological split would leave one person waiting. The two sides meet at a single function call, so they can be built at the same time.

### Person 1: Payments (Pey side)

- Project setup: Next.js scaffold, database schema, Vercel deploy
- P0-1: `create-qr` script that makes the QR image and the merchant record
- P0-2: `POST /api/pey/webhook` with signature check (bad signature → 401)
- P0-3: store each payment once, keyed by `transactionId`, so a redelivered webhook does not create a duplicate
- Today's total and count, using `America/Mexico_City`
- P0-6: if the alert cannot be sent, keep the payment and log the failure
- Test the riskiest assumption first: pay the same QR twice from Nu (PRD risk 1)

### Person 2: Messaging (WhatsApp side), ideally the team lead

The team lead owns the merchant phone and the Meta app, so this side fits them.

- Meta app, test number, test recipient
- P0-5: `GET /api/whatsapp/webhook` verification challenge; `POST` saves `last_inbound_at` and replies to `Hola`
- `sendWhatsAppText(to, body)` and the Spanish message copy (PRD §7)
- P0-7: README with setup steps and the demo script
- P1: mock-payment endpoint as a backup if the live payment fails on stage

### The shared contract

Agree on this in the first 30 minutes and do not change it without telling the other person.

```ts
// lib/whatsapp.ts  (Person 2 owns)
export async function sendWhatsAppText(to: string, body: string): Promise<void>
// Person 1 calls this from the Pey webhook after the payment is stored.
```

### File ownership

| Owner | Files |
|---|---|
| Person 1 | `lib/db.ts`, `lib/pey.ts`, `app/api/pey/**`, `scripts/create-qr.*`, schema/migrations |
| Person 2 | `lib/whatsapp.ts`, `app/api/whatsapp/**`, `README.md` |

If you need a change in the other person's file, ask them or open a small PR they review.

## 4. Original order of work (superseded)

1. Merge the PRD branch into `main` so both people start from the same `main`.
2. Person 1 pushes the scaffold, schema and first Vercel deploy to `main` (about 30 minutes). Person 2 does the Meta setup at the same time, which needs no code.
3. Each person works on their own branch (`payments`, `whatsapp`) and opens PRs into `main`.
4. Integration: the Pey webhook calls `sendWhatsAppText`.
5. Run the PRD §12 success checks: two live $0.01 payments each produce one alert within 10 seconds with the right total, and a replayed webhook produces no duplicate alert.
