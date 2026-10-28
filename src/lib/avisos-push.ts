/**
 * El texto de los avisos push al personal cuando un cliente responde un hallazgo o escribe desde su enlace. Módulo
 * puro: lo usa el servidor al mandarlos y las pruebas. Lleva el primer nombre del cliente porque llega solo a
 * celulares del equipo.
 */
import { formatearPlaca } from "./placa";

/** Lo que entrega `publico_tomar_aviso` (migración 0008). */
export type DatosAviso = {
  orden_id: string;
  numero: number;
  estado: "autorizado" | "rechazado";
  titulo: string;
  placa: string;
  cliente: string | null;
};

export type AvisoPush = { titulo: string; cuerpo: string; url: string; tag: string };

export function armarAviso(d: DatosAviso): AvisoPush {
  const quien = d.cliente?.trim() || "El cliente";
  return {
    titulo: d.estado === "autorizado" ? `✓ Autorizado · ${formatearPlaca(d.placa)}` : `No autorizó · ${formatearPlaca(d.placa)}`,
    cuerpo: `${quien} ${d.estado === "autorizado" ? "autorizó" : "no autorizó"}: ${d.titulo} (orden #${d.numero})`,
    // Al tocar el aviso se abre la orden en la app del personal.
    url: `/ordenes/${d.orden_id}`,
    // Un aviso por orden: si llegan varios seguidos, el último reemplaza al anterior en vez de apilarse.
    tag: `orden-${d.orden_id}`,
  };
}

/** Lo que entrega `publico_tomar_aviso_mensaje` (migración 0009). */
export type DatosAvisoMensaje = {
  orden_id: string;
  numero: number;
  /** Hasta 140 caracteres del mensaje. */
  texto: string;
  placa: string;
  cliente: string | null;
};

/** Largo del mensaje dentro del aviso: lo demás se lee en la orden. */
const LARGO_EN_AVISO = 100;

export function armarAvisoMensaje(d: DatosAvisoMensaje): AvisoPush {
  const quien = d.cliente?.trim() || "El cliente";
  const texto = d.texto.replace(/\s+/g, " ").trim();
  return {
    titulo: `Mensaje · ${formatearPlaca(d.placa)}`,
    cuerpo: `${quien}: ${texto.length > LARGO_EN_AVISO ? `${texto.slice(0, LARGO_EN_AVISO - 1).trimEnd()}…` : texto}`,
    url: `/ordenes/${d.orden_id}#mensajes`,
    // Aparte de las autorizaciones: un mensaje no tapa el aviso de que autorizaron un trabajo.
    tag: `mensaje-${d.orden_id}`,
  };
}

/** Convierte la llave pública VAPID (base64 url) en lo que pide `pushManager.subscribe`. */
export function llaveVapidABytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
