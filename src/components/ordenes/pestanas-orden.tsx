"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Camera, ClipboardList, MessageSquare, Wrench, type LucideIcon } from "lucide-react";
import { marcarMensajesLeidos } from "@/app/acciones/mensajes";
import {
  ETIQUETA_PESTANA,
  PESTANAS_ORDEN,
  textoAviso,
  type AvisoPestana,
  type PestanaOrden,
} from "@/lib/pestanas-orden";
import { cn } from "@/lib/utils";

const ICONO: Record<PestanaOrden, LucideIcon> = {
  orden: ClipboardList,
  hallazgos: Wrench,
  mensajes: MessageSquare,
  fotos: Camera,
};

/**
 * Las pestañas de la orden (Orden · Hallazgos · Mensajes · Fotos), con un aviso pequeño en la que tiene algo pendiente.
 * Los cuatro paneles llegan armados del servidor y quedan montados (los demás solo se ocultan): una foto subiendo o un
 * mensaje a medio escribir no se pierden al cambiar. La pestaña elegida queda en la dirección (`?ver=`) para que
 * recargar no lleve a otra. Lo que escribió el cliente queda «Visto» al abrir Mensajes, no antes.
 */
export function PestanasOrden({
  ordenId,
  inicial,
  avisos,
  nuevoMensaje,
  paneles,
}: {
  ordenId: string;
  inicial: PestanaOrden;
  avisos: Record<PestanaOrden, AvisoPestana>;
  /** El último mensaje del cliente sin leer: si llega otro, el aviso vuelve aunque ya se hubiera abierto Mensajes. */
  nuevoMensaje: string | null;
  paneles: Record<PestanaOrden, ReactNode>;
}) {
  const [activa, setActiva] = useState(inicial);
  const [mensajeVisto, setMensajeVisto] = useState(inicial === "mensajes" ? nuevoMensaje : null);
  const botones = useRef<Partial<Record<PestanaOrden, HTMLButtonElement | null>>>({});
  const marcado = useRef<string | null>(null);

  // Mensajes abierta con algo sin leer: queda visto (sin revalidar, para que el «Nuevo» siga a la vista mientras se lee).
  useEffect(() => {
    if (activa !== "mensajes" || !nuevoMensaje || marcado.current === nuevoMensaje) return;
    marcado.current = nuevoMensaje;
    void marcarMensajesLeidos(ordenId).catch(() => {});
  }, [activa, nuevoMensaje, ordenId]);

  function elegir(p: PestanaOrden) {
    // Al entrar a Mensajes o al salir de ella, lo que había sin leer ya se vio.
    if (p === "mensajes" || activa === "mensajes") setMensajeVisto(nuevoMensaje);
    setActiva(p);
    const url = new URL(window.location.href);
    url.searchParams.set("ver", p);
    window.history.replaceState(null, "", url);
  }

  /** Flechas, Inicio y Fin mueven entre pestañas (teclado y lectores de pantalla). */
  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    const n = PESTANAS_ORDEN.length;
    const i = PESTANAS_ORDEN.indexOf(activa);
    const salto: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1 + n, Home: 0, End: n - 1 };
    if (!(e.key in salto)) return;
    e.preventDefault();
    const destino = PESTANAS_ORDEN[salto[e.key] % n];
    elegir(destino);
    botones.current[destino]?.focus();
  }

  return (
    <div>
      {/* Queda pegada bajo el encabezado al bajar (mismo alto que `EncabezadoTarea`). */}
      <div className="sticky top-[calc(4rem+1px+env(safe-area-inset-top,0px))] z-10 -mx-4 bg-papel/90 px-4 py-2 backdrop-blur">
        <div
          role="tablist"
          aria-label="Partes de la orden"
          onKeyDown={alTeclear}
          className="grid grid-cols-4 gap-1 rounded-xl bg-hueso p-1"
        >
          {PESTANAS_ORDEN.map((p) => {
            const Icono = ICONO[p];
            const elegida = p === activa;
            const visto = p === "mensajes" && (activa === "mensajes" || nuevoMensaje === mensajeVisto);
            const aviso = visto ? null : avisos[p];
            const texto = textoAviso(p, aviso);
            return (
              <button
                key={p}
                ref={(b) => {
                  botones.current[p] = b;
                }}
                type="button"
                role="tab"
                id={`pestana-${p}`}
                aria-controls={`panel-${p}`}
                aria-selected={elegida}
                aria-label={texto ? `${ETIQUETA_PESTANA[p]}, ${texto}` : undefined}
                tabIndex={elegida ? 0 : -1}
                onClick={() => elegir(p)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border text-sm font-medium leading-tight",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta",
                  elegida ? "border-linea bg-superficie text-tinta" : "border-transparent text-tinta-2 active:bg-papel"
                )}
              >
                <span className="relative">
                  <Icono className="size-6" strokeWidth={elegida ? 2 : 1.5} aria-hidden />
                  {aviso === "punto" ? (
                    <span className="absolute -right-1 -top-0.5 size-3 rounded-full border border-superficie bg-oro" aria-hidden />
                  ) : aviso !== null ? (
                    <span
                      className="absolute -right-3 -top-1.5 min-w-5 rounded-full border border-superficie bg-oro px-1 text-center text-sm font-semibold leading-[1.125rem] text-tinta"
                      aria-hidden
                    >
                      {aviso}
                    </span>
                  ) : null}
                </span>
                {ETIQUETA_PESTANA[p]}
              </button>
            );
          })}
        </div>
      </div>

      {PESTANAS_ORDEN.map((p) => (
        <div key={p} role="tabpanel" id={`panel-${p}`} aria-labelledby={`pestana-${p}`} hidden={p !== activa} className="pt-3">
          {paneles[p]}
        </div>
      ))}
    </div>
  );
}
