/** Errores que se pueden mostrar tal cual al usuario (siempre en español). */
export class ErrorApp extends Error {
  constructor(
    mensaje: string,
    readonly codigo = ""
  ) {
    super(mensaje);
    this.name = "ErrorApp";
  }
}

export const MENSAJE_GENERICO = "No se pudo completar. Revisa la señal e intenta de nuevo.";

/**
 * Las funciones SQL lanzan errores de negocio en español con códigos P0001 (validación), P0002 (no existe)
 * y 42501 (sin permiso). Esos mensajes se muestran tal cual; todo lo demás (red, errores técnicos de
 * Postgres en inglés) se reemplaza por un mensaje genérico para no asustar ni filtrar detalles.
 */
export function mensajeDeError(error: { codigo?: string; mensaje?: string }): string {
  const codigo = error.codigo ?? "";
  const mensaje = error.mensaje ?? "";
  if (codigo === "P0001" || codigo === "P0002") return mensaje || MENSAJE_GENERICO;
  if (codigo === "42501" && !/^permission denied/i.test(mensaje)) return mensaje || MENSAJE_GENERICO;
  return MENSAJE_GENERICO;
}

/** Estado de un formulario con `useActionState`: null = sin error (todavía, o se guardó y se redirige). */
export type EstadoForm = { error: string | null };

/** Resultado estándar de una acción del servidor (nada de excepciones hacia el cliente). */
export type Resultado<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { datos: T }))
  | { ok: false; error: string };
