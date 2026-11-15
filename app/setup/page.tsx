"use client";

import { useState } from "react";

type Qr = { phone: string; codiQrId: string; qrImage: string | null; qrString: string };

const field = { display: "block", width: "100%", padding: 8, margin: "4px 0 12px", fontSize: 16, boxSizing: "border-box" } as const;

export default function Setup() {
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+52");
  const [amount, setAmount] = useState("0.01");
  const [concept, setConcept] = useState("");
  const [qr, setQr] = useState<Qr | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(path: string, body: object) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
    return json;
  }

  async function createQr(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("Creando QR…");
    try {
      setQr(await call("/api/admin/create-qr", { name, phone, amount: Number(amount), concept }));
      setStatus("QR creado. El comercio ya puede mandar \"Hola\" por WhatsApp.");
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  async function mockPayment() {
    if (!qr) return;
    setBusy(true);
    try {
      const r = await call("/api/mock/payment", { codiQrId: qr.codiQrId, amount: Number(amount), concept: concept || name });
      setStatus(`Pago simulado: ${r.result}`);
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Alta de comercio</h1>
      <form onSubmit={createQr}>
        <label>Clave de administrador
          <input style={field} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required />
        </label>
        <label>Nombre del comercio
          <input style={field} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>WhatsApp del comercio
          <input style={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label>Monto del QR (MXN)
          <input style={field} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>Concepto (opcional)
          <input style={field} value={concept} onChange={(e) => setConcept(e.target.value)} />
        </label>
        <button style={{ padding: "10px 16px", fontSize: 16 }} disabled={busy}>Crear QR</button>
      </form>
      <p role="status">{status}</p>
      {qr && (
        <section>
          {qr.qrImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/png;base64,${qr.qrImage}`} alt="QR de cobro CoDi" style={{ width: "100%", maxWidth: 360, background: "#fff" }} />
          ) : (
            <p>Pey no devolvió imagen. Contenido del QR: <code style={{ wordBreak: "break-all" }}>{qr.qrString}</code></p>
          )}
          <p>Comercio: {qr.phone}<br />ID del QR: <code>{qr.codiQrId}</code></p>
          <button style={{ padding: "10px 16px", fontSize: 16 }} onClick={mockPayment} disabled={busy}>Simular un pago</button>
        </section>
      )}
    </main>
  );
}
