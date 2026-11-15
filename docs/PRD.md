# PRD — CoDi payment alerts on WhatsApp (hackathon MVP)

Status: draft v1, 2026-11-14. Source: original "CoDi WhatsApp Agent" plan plus interview answers.

## 1. Summary

A stall merchant shows a preset CoDi QR. A customer pays it from their bank app. Seconds later the merchant gets a WhatsApp message saying how much arrived and how much they have collected today.

The MVP is the **confirmation experience**. Creating QRs from chat (`Cobrar 150 tacos`), which the original plan led with, is now secondary.

## 2. Problem and pitch

Informal merchants avoid bank payments because they cannot tell, at the stall, whether a transfer really arrived. They do not want a POS, an app, or tax paperwork. They already live in WhatsApp.

Pitch line: "Bank payments without forcing formalization: the customer pays by QR, WhatsApp tells you it landed."

## 3. Decisions from the interview

| Topic | Decision |
|---|---|
| Purpose | Hackathon demo only. One flawless loop, team-operated. |
| Core feature | Payment on a preset QR triggers a WhatsApp alert to the merchant. |
| QR | Fixed amount, $0.01 MXN, reusable. Created once through the Pey API by the team, screenshotted, and scanned from the screenshot. |
| Where money lands | The CoDi account already linked to the team's Pey API key. |
| WhatsApp channel | Meta Cloud API test number (no business verification). |
| Alerts | Free-form messages only, inside the 24h customer service window. No template today. |
| Extras in scope | Running daily total inside each alert. |
| Hosting and time | A few hours of build time, deployed on Vercel. |
| Credentials in hand | Pey API key only. Meta setup is still to do. |

## 4. Users

- **Merchant (primary):** receives alerts on WhatsApp. For the demo this is a team member's phone, registered as a test recipient.
- **Payer:** anyone with a Mexican bank app that supports CoDi. Scans the QR and pays $0.01. Never touches our product.
- **Operator (team):** creates the QR, seeds the merchant record, runs the demo.

## 5. Demo flow

1. Before the demo, the operator runs a script that creates the QR in Pey and saves the image.
2. The merchant sends `Hola` to the test number. The agent replies with a short confirmation. This opens 24 hours of free alerts.
3. On stage, the payer scans the QR screenshot and pays $0.01.
4. Pey calls our webhook. We store the payment and send the alert.
5. The merchant's phone shows: `✅ Recibiste $0.01 MXN — Demo tacos. Llevas $0.03 hoy (3 pagos).`
6. A second payment on the same QR shows the total going up.

## 6. Scope

### P0 — must work today

| ID | Requirement | Acceptance |
|---|---|---|
| P0-1 | Script `create-qr` calls `POST https://api.pey.mx/codi/qr` with `amount: 0.01`, `concept`, `expiration: 0`, `generateImage: true`, writes the PNG to disk, and stores `codiQrId` against a merchant phone. | Running it once produces a scannable PNG and a merchant row. |
| P0-2 | `POST /api/pey/webhook` verifies the Standard Webhooks signature on the raw body and rejects bad signatures with 401. | Tampered payload is rejected; real Pey delivery is accepted. |
| P0-3 | On `codi.qr.payment_received`, store the payment keyed by `transactionId` and look up the merchant by `codiQrId`. | A redelivered webhook does not create a second payment or a second alert. |
| P0-4 | Send one free-form WhatsApp text per payment with amount, concept, and today's total and count. "Today" uses `America/Mexico_City`. | Alert arrives within 10 seconds of the bank confirming. |
| P0-5 | `GET /api/whatsapp/webhook` answers Meta's verification challenge. `POST` records `lastInboundAt` for the sender and replies to `Hola`. | Meta shows the webhook as verified; `Hola` gets a reply. |
| P0-6 | If the merchant's 24h window is closed when a payment arrives, the payment is still stored and the failure is logged. | No crash, no lost payment record. |
| P0-7 | README: Pey webhook setup, Meta test number setup, env vars, demo script. | A teammate can run the demo from the README alone. |

### P1 — only if P0 is solid

- **Self-serve CLABE in chat.** Merchant sends their CLABE and name; agent calls `POST /bank-account`, stores the `bankAccountId`, and says activation takes up to 5 business days. Interview answer was "self-serve", but it cannot affect today's demo because of the activation delay, so it sits here.
- **Mock payment endpoint** that replays a signed sample webhook, as a stage fallback. Not selected in the interview; recommended anyway because a live bank payment is the least controllable step.

### Later

- `Cobrar 150 tacos`: one-off QR created from chat, sent as an image.
- `Hoy`: daily total on demand.
- `pago_recibido` Utility template for alerts outside the 24h window, with the free-form/template send router from the original plan.
- Open-amount QR (`amount: 0`), where the payer types the amount.
- Per-merchant accounts via `bankAccountId`, own business number, voice notes.

### Out of scope

Web dashboard, auth portal, tax/RFC flows, cards, refunds, BSP routing, Marketing messages.

## 7. Message copy (Spanish, informal)

| Trigger | Message |
|---|---|
| `Hola` | `¡Listo! Te aviso aquí cada vez que te paguen con tu QR. Los avisos están activos por 24 horas; mándame "Hola" para renovarlos.` |
| Payment | `✅ Recibiste $0.01 MXN — Demo tacos. Llevas $0.03 hoy (3 pagos).` |
| Anything else | `Por ahora solo te aviso de tus pagos. Mándame "Hola" para mantener los avisos activos.` |

## 8. Technical design

- **Stack:** Next.js (TypeScript) Route Handlers on Vercel.
- **Storage:** hosted Postgres (Neon via Vercel). In-memory is not an option on serverless.
- **Tables:**
  - `merchants(phone, name, codi_qr_id, concept, last_inbound_at)`
  - `payments(transaction_id PK, codi_qr_id, amount, concept, paid_at, alert_sent_at)`
- **Pey webhook payload fields:** `type`, `amount`, `codiQrId`, `concept`, `datePaid` (Unix), `numRef`, `transactionId`, `apiKeyId`. There is no payer name, so alerts cannot say who paid.
- **Env:** `PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `DATABASE_URL`.
- **Ordering:** insert the payment first, then send the alert, then set `alert_sent_at`. Return 2xx to Pey once the payment is stored so a WhatsApp failure does not trigger redelivery loops.

## 9. Facts checked against Pey's OpenAPI spec

- `amount` minimum is 0; 0 lets the payer enter the amount.
- `expiration: 0` means no expiration; otherwise the minimum is 360 seconds.
- `generateImage: true` returns `qrImage` as base64 PNG; `qrString` is always returned.
- `numRef` is digits only, up to 7.
- Without `bankAccountId`, payments go to the account linked to the API key.
- `POST /bank-account` creates accounts as `PENDING`; activation takes up to 5 business days.
- One webhook URL per API key, configured in the portal; the signing secret is shown once.
- There is no sandbox yet; Pey recommends testing in production with $0.01.

## 10. Risks and things to verify first

| # | Risk | Action |
|---|---|---|
| 1 | **Reusable QR is not confirmed.** The spec allows non-expiring QRs and has a paginated "transactions of a QR" endpoint, which suggests multiple payments, but it never says so outright. | First task: pay the same QR twice. If the second payment fails, pre-generate several single-use QRs. |
| 2 | The API key's own CoDi account may not be active. | Confirm in the Pey portal before building. |
| 3 | Some bank apps reject $0.01 or lack CoDi. | Test with the exact phones and banks used on stage. |
| 4 | Meta test number only sends to phones added as test recipients (up to 5), and the default access token expires in about 24 hours. | Add the demo phones; generate the token on demo day or use a system-user token. |
| 5 | The alert fails if the merchant has not written in the last 24 hours. | Demo checklist: send `Hola` right before going on stage. |
| 6 | Webhook retry behavior is undocumented. | Idempotency on `transactionId` covers it. |
| 7 | Live payment fails on stage. | Mock endpoint (P1) or a recorded video. |

## 11. Cost story (for the pitch, not built today)

- Pey CoDi API: free today.
- Inbound messages and free-form replies inside the 24h window: free.
- Alerts outside the window need the Utility template, about USD $0.0085 (MXN $0.16) each.
- The original plan's note that Utility templates inside an open window are free expired on Oct 1, 2026 by its own dates. These Meta rates come from the plan and were not re-checked; confirm on Meta's pricing page before quoting them.
- Consequence for the product after the demo: with a printed QR the merchant is usually idle, so most real alerts will be paid template messages. Budget roughly MXN $0.16 per payment, or give merchants a reason to write daily.

## 12. Success criteria

- Two consecutive live $0.01 payments each produce exactly one alert within 10 seconds, with a correct running total.
- A replayed webhook produces no duplicate alert.
- The whole demo runs from the README by someone who did not write the code.

## 13. Milestones

| Date | Deliverable |
|---|---|
| Nov 15 (kickoff MVP submission) | All P0 items: preset QR, payment webhook, WhatsApp alert with running total, README. |
| Nov 16 to Dec 14 (final submission) | The "Later" list in order: Utility template and send router, self-serve CLABE with per-merchant accounts, `Cobrar` QR from chat, `Hoy`, open-amount QR, own business number. |

## 14. Resolved questions

1. The CoDi account on the Pey API key is active.
2. Merchant phone: the team lead's iPhone. Payer: Nu app.
3. Kickoff MVP is due Nov 15; the hackathon ends Dec 14 with the larger project.
4. The team lead sets up the Meta developer app and test number.

## 15. Still to verify

- Nu can scan and pay a CoDi QR for $0.01, and the same QR can be paid twice (risks 1 and 3).
- If merchant and payer are the same phone, the QR must be shown on a second screen; scanning needs the camera.

## 16. Plan B: Twilio WhatsApp sandbox (fallback)

Update Nov 15: Meta delivery works after recreating the app (MangoPago) under the team lead's own Facebook profile, so plan A (Meta Cloud API) is active again. The app supports both through `WHATSAPP_PROVIDER`; Twilio stays as the fallback. Twilio's trial flow never recognized the Mexican number, so it is untested end to end.

| Topic | Plan A (Meta) | Plan B (Twilio sandbox) |
|---|---|---|
| Setup | Business portfolio, app, test number | Twilio account; phone sends `join <code>` to +1 415 523 8886 |
| Sender shown to merchant | Meta test number | Twilio's shared sandbox number |
| Inbound webhook | JSON, GET verification challenge | Form-encoded POST, `X-Twilio-Signature`, reply with TwiML |
| Sending | Graph API | Twilio Messages API (`whatsapp:+...` addresses) |
| Free-form window | 24h after last inbound | Same |
| Env vars | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `PUBLIC_BASE_URL` |

What stays the same: every P0 requirement, the Pey integration, storage, message copy and the demo flow. Requirement P0-5 becomes "validate the Twilio signature, record `lastInboundAt`, reply to `Hola`".

Added risks:

- Sandbox participants expire after 3 days. Re-send `join <code>` on demo day.
- Sandbox throttle: 1 message per 3 seconds, about 50 a day on a trial account. Enough for the demo.
- Twilio adds a per-message fee on top of Meta's, so the cost story in the pitch still describes Meta direct.
- Mexican numbers arrive as `+521...`; the app stores `+52...` and replies to the exact address WhatsApp used.

Migration back to Meta: replace `lib/whatsapp.ts` and the inbound route's parsing. Nothing else depends on Twilio.
