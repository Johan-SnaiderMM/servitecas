/**
 * Códigos de invitación del equipo. 8 letras y números sin 0/O/1/I (para que no se confundan al dictarlos o
 * leerlos), que se escriben como `K7MP-2XQ9`. La base los genera y los valida (migración 0005); aquí solo se
 * limpia lo que escribe la persona y se arma el mensaje para mandarlo por WhatsApp.
 * Módulo puro: lo usan componentes `"use client"`.
 */
import { MARCA } from "./marca";
import { enlaceWhatsappSinNumero } from "./whatsapp";

export const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LARGO_CODIGO = 8;

/** "k7mp-2xq9" -> "K7MP2XQ9": mayúsculas y solo letras y números. */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codigoValido(codigo: string): boolean {
  return new RegExp(`^[${ALFABETO_CODIGO}]{${LARGO_CODIGO}}$`).test(codigo);
}

/** "K7MP2XQ9" -> "K7MP-2XQ9". */
export function formatearCodigo(codigo: string): string {
  return codigo.length === LARGO_CODIGO ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo;
}

/** El mensaje que se manda por WhatsApp a la persona invitada. `enlace` ya lleva el código. */
export function mensajeInvitacion(d: { nombre: string; taller: string; codigo: string; enlace: string }): string {
  return (
    `Hola ${d.nombre}, te invité al equipo de ${d.taller} en ${MARCA.nombre}.\n` +
    `Abre este enlace en tu celular: ${d.enlace}\n` +
    `Si te pide el código, es ${formatearCodigo(d.codigo)}. Sirve una sola vez.`
  );
}

/** Enlace de WhatsApp sin número (abre la lista de contactos para elegir a quién enviarlo). */
export function enlaceWhatsappInvitacion(mensaje: string): string {
  return enlaceWhatsappSinNumero(mensaje);
}
