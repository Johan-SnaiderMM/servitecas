"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { responderHallazgo } from "@/app/acciones/publico";
import { Button } from "@/components/ui/button";
import { textoPrecio } from "@/lib/hallazgos";
import type { HallazgoPublico } from "@/lib/tipos/hallazgos";

/**
 * Lo que ve el cliente de un hallazgo que espera su respuesta: qué se encontró, por qué importa, cuánto vale y las
 * fotos. Responde con dos toques (elige y confirma): una sola vez, así que se pide confirmar.
 */
export function AutorizarHallazgo({ token, hallazgo }: { token: string; hallazgo: HallazgoPublico }) {
  const [eleccion, setEleccion] = useState<"autorizado" | "rechazado" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const h = hallazgo;

  function confirmar() {
    if (!eleccion) return;
    setError(null);
    iniciar(async () => {
      try {
        const r = await responderHallazgo(token, h.id, eleccion);
        if (!r.ok) setError(r.error);
      } catch {
        setError("No se pudo enviar tu respuesta. Revisa la señal e intenta otra vez.");
      }
    });
  }

  return (
    <article className="rounded-xl border border-oro bg-white p-4">
      <h3 className="text-lg font-semibold leading-snug">{h.titulo}</h3>
      <p className="mt-1 text-base text-tinta-2">{h.descripcion}</p>
      <p className="mt-2 text-xl font-semibold">{textoPrecio(h.precio)}</p>

      {h.fotos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {h.fotos.map((f) => (
            <li key={f}>
              <a href={`/o/${token}/foto/${f}`} target="_blank" rel="noopener noreferrer" aria-label="Ver la foto en grande">
                {/* eslint-disable-next-line @next/next/no-img-element -- servida por la app con el token del enlace */}
                <img src={`/o/${token}/foto/${f}`} alt={`Foto: ${h.titulo}`} loading="lazy" className="aspect-square w-full rounded-lg border border-linea object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {eleccion ? (
        <div className="mt-4 space-y-2">
          <p className="text-base font-medium">
            {eleccion === "autorizado"
              ? `¿Autorizas este trabajo${h.precio === null ? "" : ` por ${textoPrecio(h.precio)}`}?`
              : "¿Prefieres no hacerlo por ahora?"}
          </p>
          <Button tamano="lg" bloque variante={eleccion === "autorizado" ? "primario" : "secundario"} disabled={pendiente} onClick={confirmar}>
            {pendiente ? "Enviando…" : eleccion === "autorizado" ? "Sí, autorizo" : "Sí, por ahora no"}
          </Button>
          <Button variante="fantasma" bloque disabled={pendiente} onClick={() => setEleccion(null)}>
            Volver
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button tamano="lg" className="flex-1" onClick={() => setEleccion("autorizado")}>
            <Check className="size-5" aria-hidden />
            Autorizo
          </Button>
          <Button tamano="lg" variante="secundario" className="flex-1" onClick={() => setEleccion("rechazado")}>
            <X className="size-5" aria-hidden />
            Por ahora no
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base font-semibold text-rojo">
          {error}
        </p>
      )}
    </article>
  );
}
