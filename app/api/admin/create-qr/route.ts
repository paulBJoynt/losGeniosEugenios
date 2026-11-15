import { checkAdmin } from "@/lib/admin";
import { createCodiQr } from "@/lib/pey";
import { normalizePhone } from "@/lib/phone";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

// Creates the merchant's permanent QR in Pey and links it to their WhatsApp number.
export async function POST(req: Request) {
  const denied = checkAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const rawPhone = String(body.phone ?? "").trim();
  const amount = Number(body.amount ?? 0.01);
  const concept = String(body.concept ?? "").trim() || name;
  if (!name || !rawPhone) return Response.json({ error: "name and phone are required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return Response.json({ error: "invalid amount" }, { status: 400 });
  const phone = normalizePhone(rawPhone);
  if (!/^\+\d{11,15}$/.test(phone)) return Response.json({ error: "invalid phone" }, { status: 400 });

  try {
    const qr = await createCodiQr(amount, concept);
    await getStore().upsertMerchant({ phone, name, codiQrId: qr.id, concept });
    return Response.json({ phone, codiQrId: qr.id, qrImage: qr.qrImage, qrString: qr.qrString });
  } catch (err) {
    console.error("[admin] create-qr failed", err);
    return Response.json({ error: err instanceof Error ? err.message : "failed" }, { status: 502 });
  }
}
