import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgroGestión Pro 2.8",
  description: "Plataforma unificada de gestión agropecuaria",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
