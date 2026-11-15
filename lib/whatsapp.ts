import { createHmac, timingSafeEqual } from "node:crypto";
import twilio from "twilio";
import { normalizePhone, toWhatsAppAddress } from "./phone";

// All WhatsApp traffic goes through this module. WHATSAPP_PROVIDER picks the transport:
// "meta" (WhatsApp Cloud API, default) or "twilio" (Twilio sandbox, plan B).

export type Provider = "meta" | "twilio";
export type Inbound = { from: string; text: string };

export function provider(): Provider {
  return process.env.WHATSAPP_PROVIDER === "twilio" ? "twilio" : "meta";
}

export async function sendWhatsApp(to: string, body: string): Promise<string> {
  if (process.env.WHATSAPP_DRY_RUN) {
    console.log(`[whatsapp:dry-run:${provider()}] -> ${to}: ${body}`);
    return "dry-run";
  }
  return provider() === "twilio" ? sendTwilio(to, body) : sendMeta(to, body);
}

// ---------- Meta Cloud API ----------

async function sendMeta(to: string, body: string): Promise<string> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("Meta env vars missing (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)");
  }
  const version = process.env.META_GRAPH_VERSION ?? "v24.0";
  // Meta reports Mexican senders as 521XXXXXXXXXX, but a test number's allowed-recipient list
  // holds the 52XXXXXXXXXX form, so always send to the normalized number.
  const recipient = normalizePhone(to).replace("+", "");
  const res = await fetch(`https://graph.facebook.com/${version}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipient,
      type: "text",
      text: { body },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  };
  if (!res.ok) throw new Error(`Meta send failed (${res.status}, code ${json.error?.code}): ${json.error?.message}`);
  return json.messages?.[0]?.id ?? "";
}

/** Verifies X-Hub-Signature-256 against the raw request body using the app secret. */
export function isValidMetaRequest(signature: string | null, rawBody: string): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(signature.slice("sha256=".length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Extracts inbound text messages from a Meta webhook body; status updates yield nothing. */
export function parseMetaInbound(payload: unknown): Inbound[] {
  const out: Inbound[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] })?.changes ?? []) {
      const value = (change as { value?: { statuses?: unknown[]; messages?: unknown[] } })?.value;
      for (const s of value?.statuses ?? []) {
        const st = s as { status?: string; recipient_id?: string; errors?: unknown };
        if (st.status === "failed") console.error("[whatsapp] delivery failed", JSON.stringify(st));
      }
      for (const m of value?.messages ?? []) {
        const msg = m as { from?: string; type?: string; text?: { body?: string } };
        if (msg.from) out.push({ from: msg.from, text: msg.type === "text" ? msg.text?.body ?? "" : "" });
      }
    }
  }
  return out;
}

// ---------- Twilio ----------

async function sendTwilio(to: string, body: string): Promise<string> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error("Twilio env vars missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)");
  }
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const message = await client.messages.create({ from: TWILIO_WHATSAPP_FROM, to: toWhatsAppAddress(to), body });
  return message.sid;
}

export function isValidTwilioRequest(signature: string | null, url: string, params: Record<string, string>): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, url, params);
}
