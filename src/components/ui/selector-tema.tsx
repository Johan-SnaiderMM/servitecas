"use client";

import { useSyncExternalStore } from "react";
import { aplicarTema, leerTema, suscribirTema, type Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";

const OPCIONES: readonly { valor: Tema; etiqueta: string }[] = [
  { valor: "auto", etiqueta: "Automático" },
  { valor: "claro", etiqueta: "Claro" },
  { valor: "oscuro", etiqueta: "Oscuro" },
];

/** Claro, oscuro o el que tenga el celular. Se recuerda en este celular. La opción elegida lleva marca, no solo color. */
export function SelectorTema() {
  const tema = useSyncExternalStore(suscribirTema, leerTema, (): Tema => "auto");
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Apariencia</h2>
      <div role="radiogroup" aria-label="Apariencia de la app" className="mt-2 grid auto-cols-fr grid-flow-col gap-2">
        {OPCIONES.map((o) => {
          const elegido = o.valor === tema;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={elegido}
              onClick={() => aplicarTema(o.valor)}
              className={cn(
                "min-h-12 rounded-xl border px-3 text-base font-semibold leading-tight",
                elegido ? "border-tinta bg-tinta text-papel" : "border-linea bg-papel text-tinta active:bg-hueso"
              )}
            >
              {elegido ? "✓ " : ""}
              {o.etiqueta}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-base text-tinta-2">Automático sigue el modo claro u oscuro de tu celular.</p>
    </section>
  );
}
