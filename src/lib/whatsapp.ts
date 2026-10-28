/**
 * WhatsApp de un toque. La app no manda mensajes sola: arma el mensaje y el enlace `https://wa.me/...`, y es la
 * persona quien lo envía desde su WhatsApp. Módulo puro: lo usan componentes `"use client"`.
 */
import { formatearPlaca } from "./placa";
import { digitosParaWhatsapp } from "./telefono";

/** E.164 con el "+": lo que guarda la base (`fn_normalizar_telefono`, migración 0006). */
const E164 = /^\+[1-9][0-9]{7,14}$/;

/** Espacios normales: las horas salen con espacio fino ("2:35 p. m.") y no hace falta llevarlo al mensaje. */
function limpiar(texto: string): string {
  return texto.replace(/[  ]/g, " ");
}

/** Abre WhatsApp con el mensaje escrito y deja elegir a quién mandarlo (las invitaciones del equipo). */
export function enlaceWhatsappSinNumero(mensaje: string): string {
  return `https://wa.me/?text=${encodeURIComponent(limpiar(mensaje))}`;
}

/** Abre el chat de un celular E.164 con el mensaje escrito. `null` si no hay celular válido: no hay a dónde mandarlo. */
export function enlaceWhatsappA(e164: string | null | undefined, mensaje: string): string | null {
  if (!e164 || !E164.test(e164)) return null;
  return `https://wa.me/${digitosParaWhatsapp(e164)}?text=${encodeURIComponent(limpiar(mensaje))}`;
}

/**
 * El primer mensaje al cliente: el taller recibió su vehículo y aquí sigue el avance. Se saluda por el primer
 * nombre si se conoce.
 */
export function mensajeSeguimiento(d: { cliente: string | null; taller: string; placa: string; enlace: string }): string {
  const nombre = (d.cliente ?? "").trim().split(/\s+/)[0] ?? "";
  return (
    `Hola${nombre ? ` ${nombre}` : ""}, recibimos tu vehículo ${formatearPlaca(d.placa)} en ${d.taller}.\n` +
    `Aquí puedes ver cómo va, sin llamar: ${d.enlace}\n` +
    `El enlace se actualiza solo cada vez que avanzamos.`
  );
}
