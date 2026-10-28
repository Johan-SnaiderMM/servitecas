import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ErrorApp, mensajeDeError, MENSAJE_GENERICO, type Resultado } from "@/lib/errores";
import { exigirSesion } from "@/lib/sesion";
import { bd } from "./bd";

/** Lee datos con una función SQL. Exige sesión y lanza ErrorApp (mensaje en español) si la base rechaza. */
export async function consultar<T>(nombre: string, args: Record<string, unknown> = {}): Promise<T> {
  await exigirSesion();
  const { data, error } = await (await bd()).rpc<T>(nombre, args);
  if (error) {
    // El usuario ve un mensaje en español; el detalle técnico queda en el registro del servidor.
    console.error(`[bd] ${nombre} falló (${error.codigo}): ${error.mensaje}`);
    throw new ErrorApp(mensajeDeError(error), error.codigo);
  }
  return data as T;
}

/**
 * Ejecuta una escritura desde una acción del servidor y devuelve { ok, datos } o { ok: false, error }.
 * Nunca lanza hacia el cliente: el mensaje de error ya viene listo para mostrarse.
 */
export async function ejecutar<T = undefined>(nombre: string, args: Record<string, unknown> = {}): Promise<Resultado<T>> {
  try {
    const datos = await consultar<T>(nombre, args);
    return { ok: true, datos } as Resultado<T>;
  } catch (e) {
    unstable_rethrow(e); // redirecciones y otros errores internos de Next no se tragan
    return { ok: false, error: e instanceof ErrorApp ? e.message : MENSAJE_GENERICO };
  }
}

/**
 * Como `consultar`, pero SIN exigir sesión: solo para la API pública (funciones publico_* de la base), que es lo único
 * que un visitante sin cuenta puede ejecutar. Nunca usar para datos del personal.
 */
export async function consultarPublico<T>(nombre: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!nombre.startsWith("publico_")) {
    throw new Error(`consultarPublico solo llama funciones publico_* (recibió ${nombre})`);
  }
  const { data, error } = await (await bd()).rpc<T>(nombre, args);
  if (error) {
    console.error(`[bd] ${nombre} falló (${error.codigo}): ${error.mensaje}`);
    throw new ErrorApp(mensajeDeError(error), error.codigo);
  }
  return data as T;
}

/** Como `ejecutar` para la API pública: devuelve { ok, datos } o { ok: false, error } con un mensaje listo para el cliente. */
export async function ejecutarPublico<T = undefined>(nombre: string, args: Record<string, unknown> = {}): Promise<Resultado<T>> {
  try {
    const datos = await consultarPublico<T>(nombre, args);
    return { ok: true, datos } as Resultado<T>;
  } catch (e) {
    return { ok: false, error: e instanceof ErrorApp ? e.message : MENSAJE_GENERICO };
  }
}
