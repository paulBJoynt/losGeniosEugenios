export const metadata = { title: "CoDi WhatsApp alerts" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "3rem auto", maxWidth: 560, padding: "0 16px" }}>
        {children}
      </body>
    </html>
  );
}
