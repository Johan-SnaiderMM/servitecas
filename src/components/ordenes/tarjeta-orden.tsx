import Link from "@/components/ui/enlace";
import { ChevronRight, MessageSquare } from "lucide-react";
import { primerNombre, textoHace } from "@/lib/ordenes";
import type { OrdenEnPatio } from "@/lib/tipos/ordenes";
import { InsigniaEstado } from "./insignia-estado";
import { Placa } from "./placa";

/** Un vehículo del patio: placa, servicio, estado, cuánto lleva así y quién lo atiende. Toda la tarjeta es tocable. */
export function TarjetaOrden({ orden, ahoraMs }: { orden: OrdenEnPatio; ahoraMs: number }) {
  const minutos = (ahoraMs - Date.parse(orden.estado_desde)) / 60_000;
  return (
    <Link
      href={`/ordenes/${orden.id}`}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-linea bg-white px-4 py-3 active:bg-hueso"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Placa placa={orden.placa} />
          <InsigniaEstado estado={orden.estado} />
        </span>
        <span className="mt-1.5 block truncate text-base font-medium leading-tight">{orden.servicio}</span>
        <span className="mt-0.5 block text-base text-tinta-2">
          {textoHace(minutos)} · {orden.asignado ? primerNombre(orden.asignado.nombre) : "Sin asignar"}
        </span>
        {orden.mensajes_sin_leer > 0 && (
          <span className="mt-1 flex items-center gap-1.5 text-base font-semibold">
            <MessageSquare className="size-5 shrink-0 text-oro" aria-hidden />
            {orden.mensajes_sin_leer === 1 ? "1 mensaje nuevo" : `${orden.mensajes_sin_leer} mensajes nuevos`}
          </span>
        )}
        {(orden.hallazgos_pendientes > 0 || orden.hallazgos_autorizados > 0) && (
          <span className="mt-1 block text-base font-medium">
            {[
              orden.hallazgos_pendientes > 0 &&
                `${orden.hallazgos_pendientes} esperando al cliente`,
              orden.hallazgos_autorizados > 0 &&
                `${orden.hallazgos_autorizados} ${orden.hallazgos_autorizados === 1 ? "autorizado" : "autorizados"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-tinta-2" aria-hidden />
    </Link>
  );
}
