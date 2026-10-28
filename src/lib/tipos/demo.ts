/** Lo que devuelve `reiniciar_demo` (migración 0011). Solo tipos y textos: lo pueden importar componentes de cliente. */
export type RespuestaReinicio =
  | { ok: true }
  | { ok: false; motivo: "pin"; intentos_restantes: number }
  | { ok: false; motivo: "bloqueado"; minutos: number };

/** El mensaje cuando la base no aceptó el PIN. */
export function textoPinRechazado(r: Exclude<RespuestaReinicio, { ok: true }>): string {
  if (r.motivo === "bloqueado") {
    return `Demasiados intentos. Espera ${r.minutos === 1 ? "1 minuto" : `${r.minutos} minutos`} y vuelve a probar.`;
  }
  return r.intentos_restantes === 1
    ? "El PIN no coincide. Te queda 1 intento antes de que se bloquee 5 minutos."
    : `El PIN no coincide. Te quedan ${r.intentos_restantes} intentos.`;
}
