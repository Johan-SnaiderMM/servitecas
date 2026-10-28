import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import type { BaseDatos, RespuestaBD } from "@/lib/supabase/servidor";
import { huellaMigraciones, leerMigraciones, reclamosJwt, SUPABASE_MINIMO } from "./esquema-supabase";

/**
 * MODO LOCAL DE DESARROLLO (DEMO_BD=local): las mismas migraciones y funciones de supabase/, corriendo en
 * un Postgres embebido (PGlite) guardado en .local/. Permite desarrollar y probar la app completa sin
 * cuenta de Supabase. Nunca se usa en producción (ver abrirBD). La "sesión" es una cookie con el id del
 * usuario: solo para desarrollo, y la contraseña no se verifica.
 */

/** Dueño del taller de prueba que se crea solo la primera vez (con fn_crear_taller, como un alta real). */
export const CORREO_LOCAL = "dueno@local.test";
/** Gerente y jefe de patio del taller de DEMO (datos ficticios, migración 0011). */
export const CORREO_DEMO_LOCAL = "demo@local.test";
export const CORREO_DEMO_JEFE_LOCAL = "jefe-demo@local.test";
const COOKIE = "bd_local_uid";
const DIR = path.resolve(process.cwd(), process.env.DEMO_BD_DIR || ".local");
const DIR_BD = path.join(DIR, "pglite");
const DIR_ARCHIVOS = path.join(DIR, "archivos");
const ARCHIVO_HUELLA = path.join(DIR, "huella.txt");

const TIPO_POR_EXTENSION: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** La ruta en disco de un archivo del bucket, o null si el nombre intenta salirse de la carpeta (nada de `..`). */
function rutaEnDisco(bucket: string, ruta: string): string | null {
  if (!/^[a-z0-9-]+$/.test(bucket) || ruta.includes("\\") || ruta.split("/").some((p) => p === "" || p === "." || p === "..")) return null;
  const base = path.join(DIR_ARCHIVOS, bucket);
  const destino = path.resolve(base, ruta);
  return destino.startsWith(base + path.sep) ? destino : null;
}

declare global {
  var __bdLocal: Promise<PGlite> | undefined;
}

async function iniciar(): Promise<PGlite> {
  const huella = huellaMigraciones();
  const anterior = fs.existsSync(ARCHIVO_HUELLA) ? fs.readFileSync(ARCHIVO_HUELLA, "utf8") : null;
  // Si cambiaron las migraciones, la base local se recrea (son datos de prueba).
  if (anterior !== huella && fs.existsSync(DIR_BD)) fs.rmSync(DIR_BD, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });

  const db = new PGlite(DIR_BD, { extensions: { btree_gist } });
  await db.waitReady;
  // La primera migración crea fn_aplicar_permisos: si no está, la base es nueva.
  const existe = await db.query<{ f: string | null }>(`select to_regprocedure('public.fn_aplicar_permisos()')::text as f`);
  if (!existe.rows[0].f) {
    await db.exec(SUPABASE_MINIMO);
    for (const [, sql] of leerMigraciones()) await db.exec(sql);
    await db.query(`insert into auth.users (email) values ($1), ($2), ($3)`, [CORREO_LOCAL, CORREO_DEMO_LOCAL, CORREO_DEMO_JEFE_LOCAL]);
    await db.query(`select public.fn_crear_taller($1, 'Taller de Prueba', 'Dueño de Prueba')`, [CORREO_LOCAL]);
    // La segunda: la demo, como se da de alta en producción (fn_provisionar_demo).
    await db.query(`select public.fn_provisionar_demo($1, $2)`, [CORREO_DEMO_LOCAL, CORREO_DEMO_JEFE_LOCAL]);
  }
  fs.writeFileSync(ARCHIVO_HUELLA, huella);
  return db;
}

function baseLocal(): Promise<PGlite> {
  globalThis.__bdLocal ??= iniciar();
  return globalThis.__bdLocal;
}

export async function crearBdLocal(): Promise<BaseDatos> {
  const almacen = await cookies();
  const db = await baseLocal();
  // Quien entró en ESTA petición (la cookie nueva recién se manda al navegador): así `rpc` ya va con esa sesión.
  let recienEntrado: string | undefined;

  const usuarioId = async (): Promise<string | null> => {
    const id = recienEntrado ?? almacen.get(COOKIE)?.value;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const r = await db.query(`select 1 from auth.users where id = $1`, [id]);
    return r.rows.length ? id : null;
  };

  // Solo desarrollo: aquí no hay contraseñas guardadas. Basta con que exista un usuario con ese correo.
  const entrarComo = async (correo: string): Promise<{ error: string | null }> => {
    const r = await db.query<{ id: string }>(`select id from auth.users where lower(email) = lower($1)`, [correo]);
    if (!r.rows[0]) return { error: "El correo o la contraseña no coinciden. Revísalos." };
    recienEntrado = r.rows[0].id;
    almacen.set(COOKIE, r.rows[0].id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return { error: null };
  };

  return {
    async rpc<T>(nombre: string, args: Record<string, unknown> = {}): Promise<RespuestaBD<T>> {
      const claves = Object.keys(args);
      const lista = claves
        .map((k, i) => `${k} => $${i + 1}${args[k] !== null && typeof args[k] === "object" ? "::jsonb" : ""}`)
        .join(", ");
      const params = claves.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      const actor = await usuarioId();
      try {
        const filas = await db.transaction(async (tx) => {
          await tx.exec(`set local role ${actor ? "authenticated" : "anon"}`);
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [reclamosJwt(actor)]);
          // Como PostgREST (Supabase): el resultado sale como JSON. Así una función que devuelve `date` entrega
          // '2026-10-16' (texto) y no un objeto Date de JavaScript.
          const res = await tx.query<{ data: T }>(`select to_jsonb(public.${nombre}(${lista})) as data`, params);
          return res.rows;
        });
        return { data: filas[0].data, error: null };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return { data: null, error: { codigo: err.code ?? "", mensaje: err.message ?? "Error" } };
      }
    },

    async usuario() {
      const id = await usuarioId();
      if (!id) return null;
      const r = await db.query<{ email: string | null }>(`select email from auth.users where id = $1`, [id]);
      return { id, email: r.rows[0]?.email ?? null };
    },

    entrarConClave: (correo) => entrarComo(correo),

    entrarDemo: (quien) => entrarComo(quien === "jefe" ? CORREO_DEMO_JEFE_LOCAL : CORREO_DEMO_LOCAL),

    // Como la sesión anónima de Supabase: un usuario nuevo, sin correo.
    async entrarAnonimo() {
      const r = await db.query<{ id: string }>(`insert into auth.users (email) values (null) returning id`);
      recienEntrado = r.rows[0].id;
      almacen.set(COOKIE, r.rows[0].id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
      return { error: null };
    },

    async salir() {
      recienEntrado = undefined;
      almacen.delete(COOKIE);
    },

    // Los «buckets» son carpetas dentro de .local/archivos. Aquí no hay políticas de Storage: quien lee una foto lo
    // hace por la orden (que la base sí protege), y la ruta ya viene validada por la función que la registra.
    async subirArchivo(bucket, ruta, datos) {
      if (!(await usuarioId())) return { error: "Tu sesión se cerró. Vuelve a entrar." };
      const destino = rutaEnDisco(bucket, ruta);
      if (!destino) return { error: "La ruta del archivo no es válida." };
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      if (!fs.existsSync(destino)) fs.writeFileSync(destino, datos);
      return { error: null };
    },

    async leerArchivo(bucket, ruta) {
      if (!(await usuarioId())) return null;
      return leerDeDisco(bucket, ruta);
    },

    // Como un bucket público: sin sesión. Quien llama ya revisó el permiso con la base.
    async leerArchivoPublico(bucket, ruta) {
      return leerDeDisco(bucket, ruta);
    },
  };
}

function leerDeDisco(bucket: string, ruta: string): { datos: Uint8Array; tipo: string } | null {
  const origen = rutaEnDisco(bucket, ruta);
  if (!origen || !fs.existsSync(origen)) return null;
  const tipo = TIPO_POR_EXTENSION[path.extname(origen).slice(1)] ?? "application/octet-stream";
  return { datos: new Uint8Array(fs.readFileSync(origen)), tipo };
}
