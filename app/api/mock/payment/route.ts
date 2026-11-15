import { handlePayment } from "@/lib/payments";

export const runtime = "nodejs";

// Stage fallback: simulates a Pey payment. Disabled unless MOCK_SECRET is set.
export async function POST(req: Request) {
  const secret = process.env.MOCK_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });
  if (req.headers.get("x-mock-secret") !== secret) return new Response("Forbidden", { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const codiQrId = String(body.codiQrId ?? "");
  if (!codiQrId) return Response.json({ error: "codiQrId required" }, { status: 400 });

  const result = await handlePayment({
    transactionId: String(body.transactionId ?? `mock-${Date.now()}`),
    codiQrId,
    amount: Number(body.amount ?? 0.01),
    concept: String(body.concept ?? "Pago de prueba"),
    paidAt: new Date(),
  });
  return Response.json({ ok: true, result });
}
