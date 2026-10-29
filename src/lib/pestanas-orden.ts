/**
 * Las pestañas de una orden (Orden · Hallazgos · Mensajes · Fotos): con cuál abre y qué aviso pequeño lleva cada una
 * para que nada pendiente quede escondido en otra. Módulo puro: lo usan la página y las pestañas (`"use client"`).
 */
import { estaAbierta, type Estado } from "./ordenes";

export const PESTANAS_ORDEN = ["orden", "hallazgos", "mensajes", "fotos"] as const;
export type PestanaOrden = (typeof PESTANAS_ORDEN)[number];

export const ETIQUETA_PESTANA: Record<PestanaOrden, string> = {
  orden: "Orden",
  hallazgos: "Hallazgos",
  mensajes: "Mensajes",
  fotos: "Fotos",
};

export function esPestanaOrden(valor: unknown): valor is PestanaOrden {
  return typeof valor === "string" && (PESTANAS_ORDEN as readonly string[]).includes(valor);
}

/**
 * Con qué pestaña abre la orden: la que pide la dirección (`?ver=`, p. ej. desde un aviso push o al recargar), la de
 * hallazgos si se acaba de registrar uno, la de mensajes si el cliente escribió algo sin leer, la de fotos mientras está
 * Recibido (es cuando se toman) y si no, la de la orden.
 */
export function pestanaInicial(d: { ver?: string | null; recien?: boolean; sinLeer: number; estado: Estado }): PestanaOrden {
  if (esPestanaOrden(d.ver)) return d.ver;
  if (d.recien) return "hallazgos";
  if (d.sinLeer > 0) return "mensajes";
  if (d.estado === "recibido") return "fotos";
  return "orden";
}

/** Cuántas cosas esperan en una pestaña, un punto (falta algo, sin número) o nada. */
export type AvisoPestana = number | "punto" | null;

/**
 * El aviso pequeño de cada pestaña: hallazgos que esperan al cliente (con la orden abierta), mensajes del cliente sin
 * leer y, mientras está Recibido, que faltan las fotos de ingreso. La pestaña Orden no lleva.
 */
export function avisosPestanas(d: {
  pendientes: number;
  sinLeer: number;
  fotos: number;
  estado: Estado;
}): Record<PestanaOrden, AvisoPestana> {
  return {
    orden: null,
    hallazgos: estaAbierta(d.estado) && d.pendientes > 0 ? d.pendientes : null,
    mensajes: d.sinLeer > 0 ? d.sinLeer : null,
    fotos: d.estado === "recibido" && d.fotos === 0 ? "punto" : null,
  };
}

/** El aviso en palabras, para quien usa lector de pantalla: «Hallazgos, 1 esperando al cliente». */
export function textoAviso(pestana: PestanaOrden, aviso: AvisoPestana): string | null {
  if (aviso === null) return null;
  if (pestana === "hallazgos") return `${aviso} esperando al cliente`;
  if (pestana === "mensajes") return aviso === 1 ? "1 sin leer" : `${aviso} sin leer`;
  if (pestana === "fotos") return "faltan las fotos de ingreso";
  return null;
}
