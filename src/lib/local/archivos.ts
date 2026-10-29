import fs from "node:fs";
import path from "node:path";
import type { Motor } from "./motor";

/** Dónde se guardan las fotos en el modo local y en la demo pública. Módulo sin dependencias de Next. */
export type Archivo = { datos: Uint8Array; tipo: string };

export interface AlmacenArchivos {
  /** Guardar otra vez la misma ruta no es un error (la ruta lleva la clave de la operación: un reintento no duplica). */
  guardar(bucket: string, ruta: string, datos: Uint8Array): Promise<{ error: string | null }>;
  leer(bucket: string, ruta: string): Promise<Archivo | null>;
  /** Borra todo (al reiniciar la demo las fotos de la visita ya no pertenecen a ninguna orden). */
  vaciar(): Promise<void>;
}

const TIPO_POR_EXTENSION: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const tipoPorRuta = (ruta: string): string => TIPO_POR_EXTENSION[path.extname(ruta).slice(1)] ?? "application/octet-stream";

/** ¿El nombre del bucket y la ruta son seguros? Nada de `..`, rutas vacías ni barras invertidas. */
export function rutaValida(bucket: string, ruta: string): boolean {
  return /^[a-z0-9-]+$/.test(bucket) && !ruta.includes("\\") && !ruta.split("/").some((p) => p === "" || p === "." || p === "..");
}

export const MENSAJE_RUTA_INVALIDA = "La ruta del archivo no es válida.";
export const MENSAJE_DEMO_LLENA = "La demo se llenó de fotos. Reiníciala desde Más → Reiniciar la demo.";

/** Modo de desarrollo: carpetas dentro de .local/archivos. */
export function archivosEnDisco(dirArchivos: string): AlmacenArchivos {
  // `turbopackIgnore` evita que el empaquetado trace el proyecto entero: estas rutas dependen del entorno y solo se usan en desarrollo.
  const enDisco = (bucket: string, ruta: string): string | null => {
    if (!rutaValida(bucket, ruta)) return null;
    const base = path.join(dirArchivos, bucket);
    const destino = path.resolve(base, ruta);
    return destino.startsWith(base + path.sep) ? destino : null;
  };
  return {
    async guardar(bucket, ruta, datos) {
      const destino = enDisco(bucket, ruta);
      if (!destino) return { error: MENSAJE_RUTA_INVALIDA };
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      if (!fs.existsSync(/*turbopackIgnore: true*/ destino)) fs.writeFileSync(/*turbopackIgnore: true*/ destino, datos);
      return { error: null };
    },
    async leer(bucket, ruta) {
      const origen = enDisco(bucket, ruta);
      if (!origen || !fs.existsSync(/*turbopackIgnore: true*/ origen)) return null;
      return { datos: new Uint8Array(fs.readFileSync(/*turbopackIgnore: true*/ origen)), tipo: tipoPorRuta(origen) };
    },
    async vaciar() {
      fs.rmSync(/*turbopackIgnore: true*/ dirArchivos, { recursive: true, force: true });
    },
  };
}

/** Demo pública de un solo proceso: en la memoria, con tope de bytes. */
export function archivosEnMemoria(topeBytes: number, almacen: Map<string, Archivo> = new Map()): AlmacenArchivos {
  return {
    async guardar(bucket, ruta, datos) {
      if (!rutaValida(bucket, ruta)) return { error: MENSAJE_RUTA_INVALIDA };
      const clave = `${bucket}/${ruta}`;
      if (!almacen.has(clave)) {
        let usado = 0;
        for (const f of almacen.values()) usado += f.datos.byteLength;
        if (usado + datos.byteLength > topeBytes) return { error: MENSAJE_DEMO_LLENA };
        almacen.set(clave, { datos, tipo: tipoPorRuta(ruta) });
      }
      return { error: null };
    },
    async leer(bucket, ruta) {
      return rutaValida(bucket, ruta) ? (almacen.get(`${bucket}/${ruta}`) ?? null) : null;
    },
    async vaciar() {
      almacen.clear();
    },
  };
}

/** Demo pública compartida: en la tabla demo.archivos de la misma base (la ven todas las copias del servidor). */
export function archivosEnPostgres(motor: Motor, topeBytes: number): AlmacenArchivos {
  return {
    async guardar(bucket, ruta, datos) {
      if (!rutaValida(bucket, ruta)) return { error: MENSAJE_RUTA_INVALIDA };
      const clave = `${bucket}/${ruta}`;
      const ya = await motor.query(`select 1 from demo.archivos where clave = $1`, [clave]);
      if (ya.rows.length) return { error: null };
      const usado = await motor.query<{ n: string }>(`select coalesce(sum(octet_length(datos)), 0)::text as n from demo.archivos`);
      if (Number(usado.rows[0].n) + datos.byteLength > topeBytes) return { error: MENSAJE_DEMO_LLENA };
      await motor.query(`insert into demo.archivos (clave, tipo, datos) values ($1, $2, $3) on conflict (clave) do nothing`, [
        clave,
        tipoPorRuta(ruta),
        Buffer.from(datos),
      ]);
      return { error: null };
    },
    async leer(bucket, ruta) {
      if (!rutaValida(bucket, ruta)) return null;
      const r = await motor.query<{ tipo: string; datos: Uint8Array }>(`select tipo, datos from demo.archivos where clave = $1`, [`${bucket}/${ruta}`]);
      const fila = r.rows[0];
      return fila ? { datos: new Uint8Array(fila.datos), tipo: fila.tipo } : null;
    },
    async vaciar() {
      await motor.query(`truncate demo.archivos`);
    },
  };
}
