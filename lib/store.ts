import { neon } from "@neondatabase/serverless";

export type Merchant = {
  phone: string;
  name: string;
  codiQrId: string;
  concept: string;
  waAddress: string | null;
  lastInboundAt: Date | null;
};

export type PaymentInput = {
  transactionId: string;
  codiQrId: string;
  amount: number;
  concept: string;
  paidAt: Date;
};

export type Totals = { total: number; count: number };

export interface Store {
  upsertMerchant(m: { phone: string; name: string; codiQrId: string; concept: string }): Promise<void>;
  getMerchantByPhone(phone: string): Promise<Merchant | null>;
  getMerchantByQr(codiQrId: string): Promise<Merchant | null>;
  touchInbound(phone: string, waAddress: string): Promise<void>;
  /** Returns false when the transaction was already stored (duplicate webhook). */
  insertPayment(p: PaymentInput): Promise<boolean>;
  markAlertSent(transactionId: string): Promise<void>;
  todayTotals(codiQrId: string): Promise<Totals>;
}

const TZ = "America/Mexico_City";

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

// ---------- In-memory store (local development only) ----------

type MemoryState = {
  merchants: Map<string, Merchant>;
  payments: Map<string, PaymentInput & { alertSentAt: Date | null }>;
};

function memoryStore(): Store {
  const g = globalThis as unknown as { __codiMem?: MemoryState };
  const state = (g.__codiMem ??= { merchants: new Map(), payments: new Map() });
  return {
    async upsertMerchant(m) {
      const prev = state.merchants.get(m.phone);
      state.merchants.set(m.phone, {
        ...m,
        waAddress: prev?.waAddress ?? null,
        lastInboundAt: prev?.lastInboundAt ?? null,
      });
    },
    async getMerchantByPhone(phone) {
      return state.merchants.get(phone) ?? null;
    },
    async getMerchantByQr(codiQrId) {
      for (const m of state.merchants.values()) if (m.codiQrId === codiQrId) return m;
      return null;
    },
    async touchInbound(phone, waAddress) {
      const m = state.merchants.get(phone);
      if (m) {
        m.lastInboundAt = new Date();
        m.waAddress = waAddress;
      }
    },
    async insertPayment(p) {
      if (state.payments.has(p.transactionId)) return false;
      state.payments.set(p.transactionId, { ...p, alertSentAt: null });
      return true;
    },
    async markAlertSent(transactionId) {
      const p = state.payments.get(transactionId);
      if (p) p.alertSentAt = new Date();
    },
    async todayTotals(codiQrId) {
      const today = dayKey(new Date());
      let cents = 0;
      let count = 0;
      for (const p of state.payments.values()) {
        if (p.codiQrId === codiQrId && dayKey(p.paidAt) === today) {
          cents += Math.round(p.amount * 100);
          count++;
        }
      }
      return { total: cents / 100, count };
    },
  };
}

// ---------- Postgres store (Neon) ----------

function postgresStore(url: string): Store {
  const sql = neon(url);
  let ready: Promise<void> | null = null;
  const ensure = () =>
    (ready ??= (async () => {
      await sql`create table if not exists merchants (
        phone text primary key,
        name text not null,
        codi_qr_id text not null unique,
        concept text not null,
        wa_address text,
        last_inbound_at timestamptz
      )`;
      await sql`create table if not exists payments (
        transaction_id text primary key,
        codi_qr_id text not null,
        amount numeric(12,2) not null,
        concept text not null,
        paid_at timestamptz not null,
        alert_sent_at timestamptz
      )`;
    })());

  const toMerchant = (r: Record<string, unknown>): Merchant => ({
    phone: r.phone as string,
    name: r.name as string,
    codiQrId: r.codi_qr_id as string,
    concept: r.concept as string,
    waAddress: (r.wa_address as string | null) ?? null,
    lastInboundAt: r.last_inbound_at ? new Date(r.last_inbound_at as string) : null,
  });

  return {
    async upsertMerchant(m) {
      await ensure();
      await sql`insert into merchants (phone, name, codi_qr_id, concept)
        values (${m.phone}, ${m.name}, ${m.codiQrId}, ${m.concept})
        on conflict (phone) do update
        set name = excluded.name, codi_qr_id = excluded.codi_qr_id, concept = excluded.concept`;
    },
    async getMerchantByPhone(phone) {
      await ensure();
      const rows = await sql`select * from merchants where phone = ${phone}`;
      return rows[0] ? toMerchant(rows[0]) : null;
    },
    async getMerchantByQr(codiQrId) {
      await ensure();
      const rows = await sql`select * from merchants where codi_qr_id = ${codiQrId}`;
      return rows[0] ? toMerchant(rows[0]) : null;
    },
    async touchInbound(phone, waAddress) {
      await ensure();
      await sql`update merchants set last_inbound_at = now(), wa_address = ${waAddress} where phone = ${phone}`;
    },
    async insertPayment(p) {
      await ensure();
      const rows = await sql`insert into payments (transaction_id, codi_qr_id, amount, concept, paid_at)
        values (${p.transactionId}, ${p.codiQrId}, ${p.amount}, ${p.concept}, ${p.paidAt.toISOString()})
        on conflict (transaction_id) do nothing
        returning transaction_id`;
      return rows.length > 0;
    },
    async markAlertSent(transactionId) {
      await ensure();
      await sql`update payments set alert_sent_at = now() where transaction_id = ${transactionId}`;
    },
    async todayTotals(codiQrId) {
      await ensure();
      const rows = await sql`select coalesce(sum(amount), 0)::float8 as total, count(*)::int as count
        from payments
        where codi_qr_id = ${codiQrId}
          and (paid_at at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date`;
      return { total: Number(rows[0].total), count: Number(rows[0].count) };
    },
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) console.warn("[store] DATABASE_URL not set: using in-memory store (data is lost on restart)");
  cached = url ? postgresStore(url) : memoryStore();
  return cached;
}
