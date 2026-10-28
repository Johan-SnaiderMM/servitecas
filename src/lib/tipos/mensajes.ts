/**
 * Lo que devuelven las funciones de mensajes (migración 0009). Solo tipos: los pueden importar componentes
 * `"use client"`.
 */

/** Un mensaje dentro de `obtener_orden` (lo ve el taller). */
export type MensajeOrden = {
  id: string;
  de: "cliente" | "taller";
  texto: string;
  /** El primer nombre del cliente o el nombre de quien escribió en el taller. */
  autor: string | null;
  at: string;
  /** Solo los del cliente: ya lo vio alguien del taller. */
  leido: boolean;
};

/** Un mensaje dentro de `publico_orden` (lo ve el cliente). */
export type MensajePublico = {
  id: string;
  de: "cliente" | "taller";
  texto: string;
  at: string;
  /** Del taller: el primer nombre de quien respondió. */
  autor: string | null;
  /** Del cliente: el taller ya lo vio. */
  visto: boolean | null;
};
