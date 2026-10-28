/**
 * Fotos de las órdenes (migración 0007). La ruta en el bucket es <taller_id>/<orden_id>/<clave>.jpg, la misma regla que
 * aplica `registrar_foto_orden` en la base (una prueba las compara). Las fotos siempre se guardan como JPEG: el celular
 * las convierte al achicarlas (`src/lib/imagen.ts`).
 * Módulo puro: lo usan el servidor y los componentes `"use client"`.
 */

export const BUCKET_FOTOS = "fotos";

/** Fotos de ingreso por orden (la base pone el mismo tope). */
export const MAX_FOTOS_INGRESO = 12;

/**
 * Tamaño máximo de una foto en el servidor. Una acción del servidor acepta 1 MB en total (Next) y el bucket 1 MiB: por
 * eso el celular la comprime antes de mandarla y aquí se exige bastante menos.
 */
export const FOTO_BYTES_MAXIMOS = 900_000;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RUTA_FOTO = new RegExp(`^${UUID}/${UUID}/${UUID}\\.jpg$`);
const SOLO_UUID = new RegExp(`^${UUID}$`);

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && SOLO_UUID.test(valor);
}

/** ¿Tiene la forma de una ruta de foto? Así nada raro llega al disco ni al bucket. */
export function esRutaFotoOrden(ruta: unknown): ruta is string {
  return typeof ruta === "string" && RUTA_FOTO.test(ruta);
}

/** La ruta de una foto en el bucket, o null si algún id no es un uuid. */
export function rutaFotoOrden(tallerId: string, ordenId: string, clave: string): string | null {
  const ruta = `${tallerId}/${ordenId}/${clave}.jpg`;
  return esRutaFotoOrden(ruta) ? ruta : null;
}

/**
 * ¿Es un JPEG? Se mira el contenido (los primeros bytes), no el nombre ni el tipo que dijo el navegador: lo que se
 * guarda y se sirve como foto tiene que SER una foto.
 */
export function esJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
