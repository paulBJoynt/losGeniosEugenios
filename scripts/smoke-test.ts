// End-to-end check of the alert loop with no external services:
// in-memory store, WhatsApp in dry-run, locally signed Pey and Twilio webhooks.
// Usage: npm run smoke
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import twilio from "twilio";
import { Webhook } from "standardwebhooks";

process.env.DATABASE_URL = "";
process.env.WHATSAPP_DRY_RUN = "1";
process.env.PEY_WEBHOOK_SECRET = "whsec_" + Buffer.from("smoke-test-secret-0123456789").toString("base64");
process.env.TWILIO_AUTH_TOKEN = "smoke-token";
process.env.PUBLIC_BASE_URL = "https://example.test";

async function main() {
  const { getStore } = await import("../lib/store");
  const pey = await import("../app/api/pey/webhook/route");
  const wa = await import("../app/api/whatsapp/webhook/route");

  const sent: string[] = [];
  const origLog = console.log;
  console.log = (...a: unknown[]) => {
    const line = a.join(" ");
    if (line.startsWith("[whatsapp:dry-run")) sent.push(line);
    origLog(...a);
  };

  const store = getStore();
  await store.upsertMerchant({ phone: "+525512345678", name: "Tacos Lupita", codiQrId: "QR1", concept: "Tacos" });

  // 1a. Meta: webhook verification and inbound "Hola" from the +521 form of the same number.
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
  process.env.META_APP_SECRET = "app-secret";
  const verify = await wa.GET(
    new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"),
  );
  assert.equal(await verify.text(), "12345");
  assert.equal(
    (await wa.GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope"))).status,
    403,
  );

  const metaCall = (payload: object, sign = true) => {
    const body = JSON.stringify(payload);
    const sig = "sha256=" + createHmac("sha256", sign ? "app-secret" : "wrong").update(body).digest("hex");
    return wa.POST(
      new Request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": sig },
        body,
      }),
    );
  };
  const metaMsg = (from: string, text: string) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [{ from, type: "text", text: { body: text } }] } }] }],
  });
  assert.equal((await metaCall(metaMsg("5215512345678", "Hola"), false)).status, 403);
  assert.equal((await metaCall(metaMsg("5215512345678", "Hola"))).status, 200);
  assert.match(sent.at(-1)!, /Tacos Lupita/);
  assert.equal((await store.getMerchantByPhone("+525512345678"))?.waAddress, "5215512345678");
  await metaCall(metaMsg("5219999999999", "Hola"));
  assert.match(sent.at(-1)!, /no tiene un QR/);
  const statusOnly = { entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }] };
  const before = sent.length;
  assert.equal((await metaCall(statusOnly)).status, 200);
  assert.equal(sent.length, before, "status updates send nothing");

  // 1b. Twilio (plan B): same flow through the form-encoded webhook.
  process.env.WHATSAPP_PROVIDER = "twilio";
  const waUrl = "https://example.test/api/whatsapp/webhook";
  const waCall = (params: Record<string, string>, sign = true) =>
    wa.POST(
      new Request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": sign ? twilio.getExpectedTwilioSignature("smoke-token", waUrl, params) : "bad",
        },
        body: new URLSearchParams(params).toString(),
      }),
    );
  assert.equal((await waCall({ From: "whatsapp:+5215512345678", Body: "Hola" }, false)).status, 403);
  assert.equal((await waCall({ From: "whatsapp:+5215512345678", Body: "Hola" })).status, 200);
  assert.match(sent.at(-1)!, /whatsapp:\+5215512345678: ¡Listo, Tacos Lupita/);
  process.env.WHATSAPP_PROVIDER = "meta";
  await metaCall(metaMsg("5215512345678", "Hola"));
  sent.length = 0;

  // 2. Signed Pey payment webhooks.
  const hook = new Webhook(process.env.PEY_WEBHOOK_SECRET!);
  const peyCall = (payload: object, id: string, tamper = false) => {
    const body = JSON.stringify(payload);
    const ts = new Date();
    const signature = hook.sign(id, ts, body);
    return pey.POST(
      new Request("http://localhost/api/pey/webhook", {
        method: "POST",
        headers: {
          "webhook-id": id,
          "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
          "webhook-signature": signature,
        },
        body: tamper ? body.replace("0.01", "9999") : body,
      }),
    );
  };
  const payment = (transactionId: string) => ({
    type: "codi.qr.payment_received",
    amount: 0.01,
    codiQrId: "QR1",
    concept: "Tacos",
    datePaid: Math.floor(Date.now() / 1000),
    numRef: "0",
    transactionId,
    apiKeyId: "key",
  });

  assert.equal((await peyCall(payment("T0"), "m0", true)).status, 401);
  assert.equal(sent.length, 0);

  assert.deepEqual(await (await peyCall(payment("T1"), "m1")).json(), { ok: true, result: "alerted" });
  assert.deepEqual(await (await peyCall(payment("T1"), "m1")).json(), { ok: true, result: "duplicate" });
  assert.deepEqual(await (await peyCall(payment("T2"), "m2")).json(), { ok: true, result: "alerted" });

  assert.equal(sent.length, 2, "one alert per unique payment");
  assert.match(sent[0], /-> 5215512345678:/);
  assert.match(sent[0], /Recibiste \$0\.01 MXN — Tacos/);
  assert.match(sent[0], /\(1 pago\)/);
  assert.match(sent[1], /Llevas \$0\.02 hoy \(2 pagos\)/);

  const orphan = await peyCall({ ...payment("T3"), codiQrId: "UNKNOWN" }, "m3");
  assert.deepEqual(await orphan.json(), { ok: true, result: "no_merchant" });

  origLog("\nSmoke test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
