export type CodiQr = { id: string; qrString: string; qrImage: string | null };

/** Creates a non-expiring CoDi QR in Pey. Amount 0 lets the payer type the amount. */
export async function createCodiQr(amount: number, concept: string): Promise<CodiQr> {
  const key = process.env.PEY_API_KEY;
  if (!key) throw new Error("PEY_API_KEY is not set");
  const res = await fetch("https://api.pey.mx/codi/qr", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // expiration 0 = never expires, so the QR can be printed and reused.
    body: JSON.stringify({ amount, concept, expiration: 0, generateImage: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Pey responded ${res.status}: ${text}`);
  const qr = JSON.parse(text) as { id: string; qrString: string; qrImage?: string | null };
  return { id: qr.id, qrString: qr.qrString, qrImage: qr.qrImage ?? null };
}
