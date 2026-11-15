// WhatsApp reports Mexican mobiles as +521XXXXXXXXXX while people write +52XXXXXXXXXX.
// We store one canonical form (+52 plus 10 digits) so both match the same merchant.
export function normalizePhone(input: string): string {
  let digits = input.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  if (digits.length === 10) digits = "52" + digits;
  if (digits.length === 13 && digits.startsWith("521")) digits = "52" + digits.slice(3);
  return "+" + digits;
}

export function toWhatsAppAddress(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}
