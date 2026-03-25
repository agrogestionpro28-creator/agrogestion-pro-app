import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgroGestión Pro 2.8",
  description: "Plataforma IA Agropecuaria",
  manifest: "/manifest.json",
  themeColor: "#00FF80",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AgroPRO",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#00FF80" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AgroPRO" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) { console.log('SW registrado:', reg.scope); })
                  .catch(function(err) { console.log('SW error:', err); });
              });
            }
          `
        }} />
      </body>
    </html>
  );
}
