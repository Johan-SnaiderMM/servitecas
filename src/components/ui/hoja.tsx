"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Hoja que sube desde abajo (como un cajón) para una tarea corta: elegir otro estado, cancelar una orden. Tapa el
 * resto con un velo; se cierra con la X, tocando el velo o con Escape. Queda por encima de las barras fijas y respeta
 * la zona segura de abajo. Mientras está abierta, la página de atrás no se desplaza.
 */
export function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = anterior;
    };
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-tinta/40" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative mx-auto flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border-t border-linea bg-papel"
      >
        <header className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex size-12 items-center justify-center rounded-xl active:bg-hueso"
          >
            <X className="size-6" aria-hidden />
          </button>
        </header>
        <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-1">{children}</div>
      </section>
    </div>
  );
}
