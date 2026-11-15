// Creates the merchant's permanent CoDi QR in Pey and links it to their WhatsApp number.
// Usage: npm run create-qr -- --phone +5215512345678 --name "Tacos Lupita" [--amount 0.01] [--concept "Tacos"]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { normalizePhone } from "../lib/phone";
import { getStore } from "../lib/store";

async function main() {
  const { values } = parseArgs({
    options: {
      phone: { type: "string" },
      name: { type: "string" },
      amount: { type: "string", default: "0.01" },
      concept: { type: "string" },
    },
  });
  if (!values.phone || !values.name) {
    throw new Error('Usage: npm run create-qr -- --phone +52... --name "Stall name" [--amount 0.01] [--concept "..."]');
  }
  if (!process.env.PEY_API_KEY) throw new Error("PEY_API_KEY is not set");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (the deployed app must share this database)");

  const phone = normalizePhone(values.phone);
  const concept = values.concept ?? values.name;
  const amount = Number(values.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid --amount");

  const res = await fetch("https://api.pey.mx/codi/qr", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PEY_API_KEY}`, "Content-Type": "application/json" },
    // expiration 0 = the QR never expires, so it can be printed and reused.
    body: JSON.stringify({ amount, concept, expiration: 0, generateImage: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Pey responded ${res.status}: ${text}`);
  const qr = JSON.parse(text) as { id: string; qrString: string; qrImage?: string | null };

  await getStore().upsertMerchant({ phone, name: values.name, codiQrId: qr.id, concept });

  console.log(`Merchant ${values.name} (${phone}) linked to QR ${qr.id}`);
  if (qr.qrImage) {
    const file = `qr-${phone.replace("+", "")}.png`;
    writeFileSync(file, Buffer.from(qr.qrImage, "base64"));
    console.log(`QR image saved to ${file}`);
  } else {
    console.log("Pey returned no image. Encode this string as a QR yourself:\n" + qr.qrString);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
