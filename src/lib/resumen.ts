/**
 * Los periodos del resumen (migración 0010) y las cuentas que hace la pantalla. Módulo puro: lo usan la página y las
 * pruebas. Las cifras las calcula la base (`fn_resumen`); aquí solo se eligen las fechas y se redondea un porcentaje.
 */
import { diasEntre, fechaCorta, sumarDias } from "./fechas";
import { textoTiempo } from "./ordenes";

export const PERIODOS = ["hoy", "7", "30", "mes"] as const;
export type Periodo = (typeof PERIODOS)[number];

export const ETIQUETA_PERIODO: Record<Periodo, string> = {
  hoy: "Hoy",
  "7": "7 días",
  "30": "30 días",
  mes: "Este mes",
};

export function esPeriodo(valor: unknown): valor is Periodo {
  return typeof valor === "string" && (PERIODOS as readonly string[]).includes(valor);
}

/** Las fechas (días de Bogotá, inclusive) de un periodo que termina hoy. */
export function rangoDe(periodo: Periodo, hoy: string): { desde: string; hasta: string } {
  if (periodo === "hoy") return { desde: hoy, hasta: hoy };
  if (periodo === "mes") return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  return { desde: sumarDias(hoy, -(Number(periodo) - 1)), hasta: hoy };
}

/** "Hoy, mar 21 oct" o "15 oct – 21 oct" (con los días de la semana si es corto). */
export function textoRango(desde: string, hasta: string, hoy: string): string {
  if (desde === hasta) return `${desde === hoy ? "Hoy, " : ""}${fechaCorta(desde)}`;
  const sinDia = (f: string) => fechaCorta(f).split(" ").slice(1).join(" ");
  return diasEntre(desde, hasta) < 7 ? `${fechaCorta(desde)} – ${fechaCorta(hasta)}` : `${sinDia(desde)} – ${sinDia(hasta)}`;
}

/** De los que respondieron, qué porcentaje autorizó. `null` si nadie ha respondido. */
export function porcentajeAutorizado(autorizados: number, rechazados: number): number | null {
  const respondidos = autorizados + rechazados;
  return respondidos === 0 ? null : Math.round((autorizados * 100) / respondidos);
}

/** Un promedio en minutos (ya redondeado por la base): "menos de 1 min", "25 min", "2 h 5 min". */
export function textoDuracion(minutos: number): string {
  return minutos < 1 ? "menos de 1 min" : textoTiempo(minutos);
}
