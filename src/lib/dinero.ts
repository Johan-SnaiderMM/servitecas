/**
 * Pesos colombianos ENTEROS (la base los guarda como integer). Aquí solo se muestran y se leen: los cálculos de dinero,
 * si llegan, viven también aquí. Escrito a mano (sin Intl) para que el servidor y el navegador muestren lo mismo.
 * Módulo puro: lo usan componentes `"use client"`.
 */

/** 180000 -> "$ 180.000". */
export function formatearPesos(n: number): string {
  const v = Math.round(n);
  const miles = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "− " : ""}$ ${miles}`;
}

/** Igual sin el símbolo, para los campos: 180000 -> "180.000". */
export function formatearMiles(n: number): string {
  return formatearPesos(Math.abs(n)).replace("$ ", "");
}

/** "180.000", "$ 180 000", "180,000" -> 180000. Solo cuenta los dígitos; sin dígitos -> null. Tope: 99.999.999. */
export function leerPesos(texto: string): number | null {
  const digitos = texto.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 8);
  return digitos === "" ? null : Number(digitos);
}
