/** Fechas y horas en hora de Colombia (America/Bogota), igual que la base de datos. */

const ZONA = "America/Bogota";

/** 'YYYY-MM-DD' de hoy en Bogotá. */
export function hoyBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora);
}

// Nombres escritos a mano: Intl cambia de forma según el motor (servidor vs. navegador) y rompería la hidratación.
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function mayuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fechaUtc(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** '2026-10-05' -> "Lunes 5 de octubre". */
export function fechaLarga(fecha: string): string {
  const f = fechaUtc(fecha);
  return mayuscula(`${DIAS[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`);
}

/** '2026-10-05' -> "lun 5 oct". */
export function fechaCorta(fecha: string): string {
  const f = fechaUtc(fecha);
  return `${DIAS[f.getUTCDay()].slice(0, 3)} ${f.getUTCDate()} ${MESES[f.getUTCMonth()].slice(0, 3)}`;
}

/** '2026-10-05' -> "Hoy", "Ayer" o "lun 5 oct". */
export function fechaRelativa(fecha: string, hoy: string = hoyBogota()): string {
  const dias = diasEntre(fecha, hoy);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return fechaCorta(fecha);
}

/** '2026-10-13' + (-1) -> '2026-10-12'. Cruza meses y años. */
export function sumarDias(fecha: string, dias: number): string {
  const f = fechaUtc(fecha);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

/** Días completos entre dos fechas 'YYYY-MM-DD' (hasta - desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((fechaUtc(hasta).getTime() - fechaUtc(desde).getTime()) / 86_400_000);
}

/** ISO -> "2:35 p. m." en hora de Bogotá. */
export function horaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONA })
    .format(new Date(iso))
    .replace(/\s/g, " ");
}

/**
 * Cuándo pasó algo, corto: "Hoy, 9:40 a. m." o "lun 5 oct, 9:40 a. m.". Con `soloHoraSiEsHoy` lo de hoy es solo la hora
 * ("9:40 a. m."): sirve en las pantallas del personal, donde casi todo es de hoy.
 */
export function momentoCorto(iso: string, hoy: string, { soloHoraSiEsHoy = false } = {}): string {
  const dia = fechaBogota(iso);
  if (dia === hoy) return soloHoraSiEsHoy ? horaCorta(iso) : `Hoy, ${horaCorta(iso)}`;
  return `${fechaCorta(dia)}, ${horaCorta(iso)}`;
}

/** "hace 3 días", "hoy", "ayer" a partir de días enteros. */
export function textoDias(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

// ---------------------------------------------------------------------
// Instantes (timestamptz) y horas del día en Bogotá
// ---------------------------------------------------------------------

/** Colombia no tiene horario de verano: Bogotá es UTC-5 todo el año. */
const OFFSET_BOGOTA = "-05:00";

/**
 * Instante ISO (con el offset de Bogotá) de una hora del día: ('2026-11-02', 540) -> '2026-11-02T09:00:00-05:00'.
 * 1440 es la medianoche final, es decir, las 00:00 del día siguiente. Es lo que se manda a la base para bloqueos y citas.
 */
export function instanteBogota(fecha: string, minutos: number): string {
  const dia = minutos >= 1440 ? sumarDias(fecha, 1) : fecha;
  const m = minutos >= 1440 ? minutos - 1440 : minutos;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${dia}T${hh}:${mm}:00${OFFSET_BOGOTA}`;
}

/** Minutos desde la medianoche, en hora de Bogotá, de un instante ISO. */
export function minutosDelDiaBogota(iso: string): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** 'YYYY-MM-DD' (día de Bogotá) de un instante ISO. */
export function fechaBogota(iso: string): string {
  return hoyBogota(new Date(iso));
}
