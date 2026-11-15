import { checkAdmin } from "@/lib/admin";
import { handlePayment } from "@/lib/payments";

export const runtime = "nodejs";

// Stage fallback: simulates a Pey payment. Disabled unless ADMIN_SECRET is set.
export async function POST(req: Request) {
  const denied = checkAdmin(req);
  if (denied) return denied;

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
