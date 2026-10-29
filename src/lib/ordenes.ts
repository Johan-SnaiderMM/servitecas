/**
 * Estados de una orden. La lista es idéntica a `fn_estados()` en SQL (migración 0006): una prueba las compara.
 * Recibido → Diagnóstico → En proceso → Listo → Entregado; Cancelada (con motivo) desde cualquiera abierta.
 * Módulo puro: lo usan componentes `"use client"`.
 */
import { textoPlano } from "./texto";

export const ESTADOS = ["recibido", "diagnostico", "en_proceso", "listo", "entregado", "cancelada"] as const;
export type Estado = (typeof ESTADOS)[number];

/** Los que siguen en el patio. */
export const ESTADOS_ABIERTOS = ["recibido", "diagnostico", "en_proceso", "listo"] as const satisfies readonly Estado[];

/** Lo que ve el personal. */
export const ETIQUETA_ESTADO: Record<Estado, string> = {
  recibido: "Recibido",
  diagnostico: "En diagnóstico",
  en_proceso: "En proceso",
  listo: "Listo para entregar",
  entregado: "Entregado",
  cancelada: "Cancelada",
};

/** Lo que ve el cliente en su enlace. */
export const TEXTO_CLIENTE: Record<Estado, string> = {
  recibido: "Recibimos tu vehículo",
  diagnostico: "Estamos revisando tu vehículo",
  en_proceso: "Estamos trabajando en tu vehículo",
  listo: "Tu vehículo está listo",
  entregado: "Entregamos tu vehículo",
  cancelada: "Esta orden se canceló",
};

/** Los pasos que se muestran como progreso (sin cancelada). */
export const PASOS = ["recibido", "diagnostico", "en_proceso", "listo", "entregado"] as const satisfies readonly Estado[];

export function esEstado(valor: unknown): valor is Estado {
  return typeof valor === "string" && (ESTADOS as readonly string[]).includes(valor);
}

export function estaAbierta(estado: Estado): boolean {
  return (ESTADOS_ABIERTOS as readonly string[]).includes(estado);
}

/** El paso natural siguiente (el botón grande de la orden). null si ya está cerrada. */
export function siguienteEstado(estado: Estado): Estado | null {
  const i = (PASOS as readonly string[]).indexOf(estado);
  if (i < 0 || i >= PASOS.length - 1) return null;
  return PASOS[i + 1];
}

/** El texto del botón que lleva a `destino`: "Empezar diagnóstico", "Marcar como listo"… */
export function textoAvanzar(destino: Estado): string {
  const textos: Partial<Record<Estado, string>> = {
    diagnostico: "Empezar diagnóstico",
    en_proceso: "Empezar el trabajo",
    listo: "Marcar como listo",
    entregado: "Entregar al cliente",
  };
  return textos[destino] ?? `Pasar a ${ETIQUETA_ESTADO[destino].toLowerCase()}`;
}

/** Minutos -> "12 min", "2 h 5 min", "3 días". */
export function textoTiempo(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const d = Math.floor(m / (24 * 60));
  return d === 1 ? "1 día" : `${d} días`;
}

/** "Ahora mismo", "Hace 12 min", "Hace 2 h". */
export function textoHace(minutos: number): string {
  return minutos < 1 ? "Ahora mismo" : `Hace ${textoTiempo(minutos)}`;
}

/** Desde cuántos vehículos en el patio aparece el buscador (con menos, se ven todos de un vistazo). */
export const MIN_PARA_BUSCAR_EN_PATIO = 6;

/**
 * Los vehículos del patio que coinciden con lo escrito: la placa (sin importar espacios ni guiones), el servicio, el
 * cliente o quién lo atiende, sin tildes ni mayúsculas. Vacío = todos.
 */
export function filtrarPatio<
  T extends { placa: string; servicio: string; cliente: string | null; asignado: { nombre: string } | null },
>(ordenes: T[], busqueda: string): T[] {
  const q = textoPlano(busqueda.trim());
  if (!q) return ordenes;
  const qPlaca = q.replace(/[\s-]/g, "");
  return ordenes.filter(
    (o) =>
      (qPlaca !== "" && textoPlano(o.placa).replace(/[\s-]/g, "").includes(qPlaca)) ||
      textoPlano(`${o.servicio} ${o.cliente ?? ""} ${o.asignado?.nombre ?? ""}`).includes(q)
  );
}

/** Primer nombre para saludar o para "lo atiende Mateo". */
export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? "").trim().split(/\s+/)[0] ?? "";
}
