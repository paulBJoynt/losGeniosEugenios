import { paymentMessage } from "./messages";
import { getStore, type PaymentInput } from "./store";
import { sendWhatsApp } from "./whatsapp";

export type PaymentResult = "alerted" | "duplicate" | "no_merchant" | "alert_failed";

// Store first, alert second: a WhatsApp failure must never lose the payment record.
export async function handlePayment(p: PaymentInput): Promise<PaymentResult> {
  const store = getStore();
  const isNew = await store.insertPayment(p);
  if (!isNew) return "duplicate";

  const merchant = await store.getMerchantByQr(p.codiQrId);
  if (!merchant) {
    console.warn(`[payment] ${p.transactionId}: no merchant for QR ${p.codiQrId}`);
    return "no_merchant";
  }

  const totals = await store.todayTotals(p.codiQrId);
  try {
    await sendWhatsApp(merchant.waAddress ?? merchant.phone, paymentMessage(p.amount, p.concept, totals));
    await store.markAlertSent(p.transactionId);
    return "alerted";
  } catch (err) {
    console.error(`[payment] ${p.transactionId}: alert failed`, err);
    return "alert_failed";
  }
}
