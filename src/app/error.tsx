"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Cuando una pantalla falla al cargar (la base no respondió, se cayó la señal): dice qué pasó y deja volver a intentar,
 * en vez de la pantalla de error genérica de Next. No muestra el mensaje técnico.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="columna-app px-4 pb-10 pt-[calc(2rem+env(safe-area-inset-top,0px))]">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">No pudimos cargar esta pantalla</h1>
      <p role="alert" className="mt-2 text-base text-tinta-2">
        Puede ser la señal del celular. Vuelve a intentar; si sigue pasando, cierra la app y ábrela de nuevo.
      </p>
      <Button tamano="lg" bloque className="mt-6" onClick={() => retry()}>
        Reintentar
      </Button>
    </main>
  );
}
