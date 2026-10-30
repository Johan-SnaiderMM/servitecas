import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { COLOR_TEMA, COLOR_TEMA_OSCURO, MARCA } from "@/lib/marca";
import { SCRIPT_TEMA } from "@/lib/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: MARCA.nombre, template: `%s · ${MARCA.nombre}` },
  description: MARCA.lema,
  applicationName: MARCA.nombre,
  // Herramienta de trabajo con datos de clientes: que no salga en buscadores.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: MARCA.nombre, statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes" },
  // Vista previa al compartir el enlace (LinkedIn, WhatsApp): la imagen vive en `icons/` porque el proxy no pasa por ahí.
  metadataBase: new URL("https://servitecas.vercel.app"),
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: MARCA.nombre,
    title: `${MARCA.nombre} · demo`,
    description: "PWA para talleres: el cliente ve el avance de su vehículo y autoriza trabajos desde el celular. Datos ficticios.",
    images: [{ url: "/icons/og.png", width: 1200, height: 627, alt: "Servitecas: el cliente ve el avance de su vehículo y autoriza trabajos" }],
  },
  twitter: { card: "summary_large_image", title: `${MARCA.nombre} · demo`, images: ["/icons/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1, // sin maximumScale: el zoom con los dedos sigue disponible
  viewportFit: "cover", // respeta las zonas seguras (notch, barra de gestos)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: COLOR_TEMA },
    { media: "(prefers-color-scheme: dark)", color: COLOR_TEMA_OSCURO },
  ],
  // El teclado del sistema reduce la altura de la página: las acciones de abajo quedan SOBRE el teclado.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Pone el tema elegido antes de pintar, para que no se vea un destello del otro. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
