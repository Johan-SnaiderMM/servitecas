"use client";

import { useEffect } from "react";
import { COLOR_MARCA, COLOR_TEMA } from "@/lib/marca";

/**
 * Último recurso: falla el diseño raíz de la app. Reemplaza al diseño, así que trae su propio `<html>` y no tiene los
 * estilos globales: va con estilos en línea, con los colores de la marca y un botón de 56 px.
 */
export default function ErrorGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, background: COLOR_TEMA, color: COLOR_MARCA, fontFamily: "system-ui, sans-serif", fontSize: 16, lineHeight: 1.4 }}>
        <main style={{ maxWidth: "28rem", margin: "0 auto", padding: "2rem 1rem" }}>
          <h1 style={{ fontSize: "1.875rem", lineHeight: 1.2, margin: 0 }}>No pudimos abrir la app</h1>
          <p role="alert" style={{ margin: "0.75rem 0 1.5rem" }}>
            Puede ser la señal del celular. Vuelve a intentar; si sigue pasando, cierra la app y ábrela de nuevo.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 56, width: "100%", border: `1px solid ${COLOR_MARCA}`, borderRadius: 12, background: COLOR_MARCA, color: COLOR_TEMA, fontSize: 16, fontWeight: 500 }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
