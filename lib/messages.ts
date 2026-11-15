import type { Totals } from "./store";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
export const money = (n: number) => mxn.format(n);

export function welcomeMessage(name: string): string {
  return `¡Listo, ${name}! Te aviso aquí cada vez que te paguen con tu QR. Los avisos están activos por 24 horas; mándame "Hola" para renovarlos.`;
}

export function unknownMerchantMessage(): string {
  return "Hola. Este número todavía no tiene un QR de cobro registrado. Pide al equipo que lo dé de alta.";
}

export function fallbackMessage(): string {
  return 'Por ahora solo te aviso de tus pagos. Mándame "Hola" para mantener los avisos activos.';
}

export function paymentMessage(amount: number, concept: string, totals: Totals): string {
  const pagos = totals.count === 1 ? "1 pago" : `${totals.count} pagos`;
  const what = concept ? ` — ${concept}` : "";
  return `✅ Recibiste ${money(amount)} MXN${what}.\nLlevas ${money(totals.total)} hoy (${pagos}).`;
}
