/**
 * Mensajes entre el cliente (desde su enlace) y el taller (migración 0009). Módulo puro: lo usan componentes
 * `"use client"` y las pruebas.
 */
import { formatearPlaca } from "./placa";

/** Largo máximo de un mensaje (igual que en la base). */
export const MAX_MENSAJE = 500;

/** Mensajes que el cliente puede mandar por hora en una orden. Espejo de `fn_limite_mensajes_hora` (una prueba los compara). */
export const LIMITE_MENSAJES_HORA = 10;

/** Lo que responde `publico_enviar_mensaje` cuando no guarda, en palabras para el cliente. */
export const MOTIVO_MENSAJE: Record<string, string> = {
  no_existe: "Este enlace ya no recibe mensajes. Si tienes dudas, escríbele al taller por WhatsApp.",
  cerrada: "Esta orden ya se cerró. Si tienes dudas, escríbele al taller por WhatsApp.",
  vacio: "Escribe tu mensaje.",
  largo: `Tu mensaje es muy largo (máximo ${MAX_MENSAJE} caracteres).`,
  limite: "Ya enviaste varios mensajes seguidos. Espera un rato o escríbele al taller por WhatsApp.",
};

/**
 * El aviso por WhatsApp de que el taller respondió en el enlace: corto, para que el cliente lo abra y lea ahí la
 * respuesta completa.
 */
export function mensajeRespuesta(d: { cliente: string | null; placa: string; enlace: string }): string {
  const nombre = (d.cliente ?? "").trim().split(/\s+/)[0] ?? "";
  return (
    `Hola${nombre ? ` ${nombre}` : ""}, te respondimos sobre tu vehículo ${formatearPlaca(d.placa)}.\n` +
    `Míralo aquí: ${d.enlace}`
  );
}
