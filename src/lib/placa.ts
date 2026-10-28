/**
 * Placas de vehículos. Se guardan sin espacios ni guiones y en mayúsculas (`ABC123`). Misma regla que
 * `fn_normalizar_placa` en SQL (migración 0006): una prueba compara ambas con la misma tabla de casos.
 * Se acepta cualquier placa de 5 a 7 letras y números (con al menos una de cada): así entran las de otros países
 * (Panamá, Venezuela) y las antiguas. Carro y moto se reconocen por su forma.
 * Módulo puro: lo usan componentes `"use client"`.
 */

export const ERROR_PLACA_VACIA = "Escribe la placa.";
export const ERROR_PLACA = "La placa no es válida. Escríbela como ABC123 (carro) o ABC12D (moto).";

export type ResultadoPlaca = { ok: true; valor: string } | { ok: false; error: string };
export type TipoVehiculo = "carro" | "moto" | "otro";

/** " abc-123 " -> "ABC123". */
export function normalizarPlaca(texto: string | null | undefined): ResultadoPlaca {
  // Primero se quita lo que no es letra o número (igual que en SQL) y luego se pasa a mayúsculas.
  const v = (texto ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (v === "") return { ok: false, error: ERROR_PLACA_VACIA };
  if (!/^[A-Z0-9]{5,7}$/.test(v) || !/[A-Z]/.test(v) || !/[0-9]/.test(v)) return { ok: false, error: ERROR_PLACA };
  return { ok: true, valor: v };
}

/** Carro (ABC123), moto (ABC12D) u otra forma (extranjera, antigua). Igual que la columna generada `tipo`. */
export function tipoPlaca(placa: string): TipoVehiculo {
  if (/^[A-Z]{3}[0-9]{3}$/.test(placa)) return "carro";
  if (/^[A-Z]{3}[0-9]{2}[A-Z]$/.test(placa)) return "moto";
  return "otro";
}

/** "ABC123" -> "ABC 123" y "ABC12D" -> "ABC 12D", como se ven en la placa. Lo demás, tal cual. */
export function formatearPlaca(placa: string): string {
  return tipoPlaca(placa) === "otro" ? placa : `${placa.slice(0, 3)} ${placa.slice(3)}`;
}
