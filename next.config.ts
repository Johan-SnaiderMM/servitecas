import type { NextConfig } from "next";

const esDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. Next inyecta scripts en línea para hidratar, así que se permite 'unsafe-inline'
 * (sin nonces); aun así se bloquea cargar código de otros dominios, enviar datos a servidores ajenos y
 * que otro sitio incruste la app. El navegador NUNCA habla con Supabase (las fotos las sirve la app y los datos van por
 * el servidor): por eso aquí no aparece ningún otro origen.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self'${esDev ? " ws: wss:" : ""}`,
  "font-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // PGlite (base local de desarrollo) usa WASM: no debe empaquetarse.
  serverExternalPackages: ["@electric-sql/pglite"],
  // La demo pública (DEMO_PUBLICA=1) arma su base en memoria al arrancar: la función necesita leer las migraciones.
  outputFileTracingIncludes: {
    "/*": ["./supabase/migrations/**/*"],
    "/**": ["./supabase/migrations/**/*"],
  },
  // El indicador de desarrollo (círculo con la "N") tapa los botones de abajo.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Cámara solo para la propia app (fotos de ingreso y de hallazgos); micrófono y ubicación no.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
