import { fallbackMessage, unknownMerchantMessage, welcomeMessage } from "@/lib/messages";
import { normalizePhone } from "@/lib/phone";
import { getStore } from "@/lib/store";
import {
  type Inbound,
  isValidMetaRequest,
  isValidTwilioRequest,
  parseMetaInbound,
  provider,
  sendWhatsApp,
} from "@/lib/whatsapp";

export const runtime = "nodejs";

// Meta calls this once when the webhook is configured, to prove we own the URL.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Twilio signs the public URL it called; behind Vercel's proxy req.url may differ, so prefer PUBLIC_BASE_URL.
function publicUrl(req: Request): string {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (base) return base + new URL(req.url).pathname;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}${new URL(req.url).pathname}`;
}

async function handleInbound({ from, text }: Inbound): Promise<void> {
  const phone = normalizePhone(from);
  const store = getStore();
  const merchant = await store.getMerchantByPhone(phone);
  let reply: string;
  if (!merchant) {
    reply = unknownMerchantMessage();
  } else {
    // Any inbound message reopens the 24h window; keep the exact address WhatsApp used.
    await store.touchInbound(phone, from);
    reply = /^(hola|ola|buenas|buenos)/.test(text.trim().toLowerCase())
      ? welcomeMessage(merchant.name)
      : fallbackMessage();
  }
  try {
    await sendWhatsApp(from, reply);
  } catch (err) {
    console.error("[whatsapp] reply failed", err);
  }
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (provider() === "twilio") {
    const params = Object.fromEntries(new URLSearchParams(raw));
    if (!isValidTwilioRequest(req.headers.get("x-twilio-signature"), publicUrl(req), params)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (params.From) await handleInbound({ from: params.From, text: params.Body ?? "" });
    return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }

  if (!isValidMetaRequest(req.headers.get("x-hub-signature-256"), raw)) {
    return new Response("Forbidden", { status: 403 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  for (const inbound of parseMetaInbound(payload)) await handleInbound(inbound);
  // Always acknowledge, or Meta retries and eventually disables the webhook.
  return Response.json({ ok: true });
}
