/**
 * Celulares. Se guardan en E.164 (`+573001234567`). Misma regla que `fn_normalizar_telefono` en SQL
 * (migración 0006): una prueba compara ambas con la misma tabla de casos. La base es la que decide.
 * Módulo puro: lo usan componentes `"use client"`.
 */

export const ERROR_TELEFONO = "El celular no es válido. Escríbelo con 10 dígitos, por ejemplo 300 123 4567.";

export type ResultadoTelefono = { ok: true; valor: string | null } | { ok: false; error: string };

/**
 * "300 123 4567" -> "+573001234567". Vacío -> null. Con "+" o "00" se respeta el país; sin ellos solo se aceptan
 * celulares colombianos (10 dígitos que empiezan por 3, con o sin el 57 adelante).
 */
export function normalizarTelefono(texto: string | null | undefined): ResultadoTelefono {
  const t = (texto ?? "").trim();
  if (t === "") return { ok: true, valor: null };

  let dig = t.replace(/\D/g, "");
  if (t.startsWith("+") || dig.startsWith("00")) {
    dig = dig.replace(/^00/, "");
    if (/^[1-9][0-9]{7,14}$/.test(dig)) return { ok: true, valor: `+${dig}` };
  } else if (/^3[0-9]{9}$/.test(dig)) {
    return { ok: true, valor: `+57${dig}` };
  } else if (/^573[0-9]{9}$/.test(dig)) {
    return { ok: true, valor: `+${dig}` };
  }
  return { ok: false, error: ERROR_TELEFONO };
}

/** "+573001234567" -> "300 123 4567". Cualquier otro formato se muestra tal cual. */
export function formatearTelefono(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+57(3\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** "+573001234567" -> "573001234567": lo que pide `https://wa.me/<número>`. */
export function digitosParaWhatsapp(e164: string): string {
  return e164.replace(/\D/g, "");
}
