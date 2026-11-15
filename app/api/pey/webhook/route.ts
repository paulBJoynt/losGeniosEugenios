import { Webhook } from "standardwebhooks";
import { handlePayment } from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.PEY_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "PEY_WEBHOOK_SECRET not configured" }, { status: 500 });

  // The signature covers the exact bytes Pey sent, so verify the raw body before parsing.
  const raw = await req.text();
  let event: Record<string, unknown>;
  try {
    event = new Webhook(secret).verify(raw, {
      "webhook-id": req.headers.get("webhook-id") ?? "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": req.headers.get("webhook-signature") ?? "",
    }) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  if (event.type !== "codi.qr.payment_received") return Response.json({ ok: true, ignored: event.type });

  // Pey documents a flat payload; tolerate a `data` wrapper in case that changes.
  const d = (typeof event.data === "object" && event.data ? event.data : event) as Record<string, unknown>;
  const transactionId = String(d.transactionId ?? "");
  const codiQrId = String(d.codiQrId ?? "");
  const amount = Number(d.amount);
  if (!transactionId || !codiQrId || !Number.isFinite(amount)) {
    console.error("[pey] unexpected payload", raw);
    return Response.json({ error: "unexpected payload" }, { status: 400 });
  }

  const rawDate = Number(d.datePaid);
  const paidAt = Number.isFinite(rawDate) && rawDate > 0
    ? new Date(rawDate < 1e12 ? rawDate * 1000 : rawDate) // seconds or milliseconds
    : new Date();

  const result = await handlePayment({
    transactionId,
    codiQrId,
    amount,
    concept: String(d.concept ?? ""),
    paidAt,
  });
  return Response.json({ ok: true, result });
}
