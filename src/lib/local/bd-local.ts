import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { usarDemoPublica, type BaseDatos, type RespuestaBD } from "@/lib/supabase/servidor";
import { huellaMigraciones, leerMigraciones, reclamosJwt, SUPABASE_MINIMO } from "./esquema-supabase";

/**
 * MODO LOCAL DE DESARROLLO (DEMO_BD=local): las mismas migraciones y funciones de supabase/, corriendo en
 * un Postgres embebido (PGlite) guardado en .local/. Permite desarrollar y probar la app completa sin
 * cuenta de Supabase. Nunca se usa en producción (ver abrirBD). La "sesión" es una cookie con el id del
 * usuario: solo para desarrollo, y la contraseña no se verifica.
 *
 * DEMO PÚBLICA (DEMO_PUBLICA=1): la misma base, pero SOLO en memoria y sin tocar el disco (en Vercel es de solo
 * lectura). Cada instancia del servidor arranca su propia copia con datos ficticios, así que lo que se haga se borra
 * solo cuando la instancia se recicla. Como esto sí corre en producción, se cierra lo que en desarrollo es cómodo: no
 * hay entrada por contraseña (solo los botones de la demo), las fotos tienen tope y los usuarios anónimos también.
 */

/** Dueño del taller de prueba que se crea solo la primera vez (con fn_crear_taller, como un alta real). */
export const CORREO_LOCAL = "dueno@local.test";
/** Gerente y jefe de patio del taller de DEMO (datos ficticios, migración 0011). */
export const CORREO_DEMO_LOCAL = "demo@local.test";
export const CORREO_DEMO_JEFE_LOCAL = "jefe-demo@local.test";
const COOKIE = "bd_local_uid";
// Las rutas de disco son solo del modo de desarrollo: `turbopackIgnore` evita que el empaquetado trace el proyecto entero.
const DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DEMO_BD_DIR || ".local");
const DIR_BD = path.join(DIR, "pglite");
const DIR_ARCHIVOS = path.join(DIR, "archivos");
const ARCHIVO_HUELLA = path.join(DIR, "huella.txt");

const PUBLICA = usarDemoPublica();
/** Demo pública: cuánto pueden pesar en total las fotos que se quedan en la memoria de la instancia. */
const TOPE_FOTOS_MEMORIA = 40 * 1024 * 1024;
/** Demo pública: cuántos usuarios (con cuenta anónima incluida) caben antes de pedir que vuelvan más tarde. */
const TOPE_USUARIOS_MEMORIA = 500;
const SEGUNDOS_DIA = 60 * 60 * 24;

const TIPO_POR_EXTENSION: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

const tipoPorRuta = (ruta: string): string => TIPO_POR_EXTENSION[path.extname(ruta).slice(1)] ?? "application/octet-stream";

/** ¿El nombre del bucket y la ruta son seguros? Nada de `..`, rutas vacías ni barras invertidas. */
function rutaValida(bucket: string, ruta: string): boolean {
  return /^[a-z0-9-]+$/.test(bucket) && !ruta.includes("\\") && !ruta.split("/").some((p) => p === "" || p === "." || p === "..");
}

/** La ruta en disco de un archivo del bucket, o null si el nombre intenta salirse de la carpeta (nada de `..`). */
function rutaEnDisco(bucket: string, ruta: string): string | null {
  if (!rutaValida(bucket, ruta)) return null;
  const base = path.join(DIR_ARCHIVOS, bucket);
  const destino = path.resolve(base, ruta);
  return destino.startsWith(base + path.sep) ? destino : null;
}

declare global {
  var __bdLocal: Promise<PGlite> | undefined;
  var __fotosDemoPublica: Map<string, { datos: Uint8Array; tipo: string }> | undefined;
}

/** Las fotos de la demo pública: viven en la memoria de la instancia, igual que su base. */
function fotosEnMemoria(): Map<string, { datos: Uint8Array; tipo: string }> {
  globalThis.__fotosDemoPublica ??= new Map();
  return globalThis.__fotosDemoPublica;
}

/** Esquema mínimo de Supabase, las migraciones, el taller de prueba y la demo (como se dan de alta en producción). */
async function prepararBase(db: PGlite): Promise<void> {
  await db.exec(SUPABASE_MINIMO);
  for (const [, sql] of leerMigraciones()) await db.exec(sql);
  await db.query(`insert into auth.users (email) values ($1), ($2), ($3)`, [CORREO_LOCAL, CORREO_DEMO_LOCAL, CORREO_DEMO_JEFE_LOCAL]);
  await db.query(`select public.fn_crear_taller($1, 'Taller de Prueba', 'Dueño de Prueba')`, [CORREO_LOCAL]);
  // La segunda: la demo, como se da de alta en producción (fn_provisionar_demo).
  await db.query(`select public.fn_provisionar_demo($1, $2)`, [CORREO_DEMO_LOCAL, CORREO_DEMO_JEFE_LOCAL]);
}

async function iniciar(): Promise<PGlite> {
  if (PUBLICA) {
    const enMemoria = new PGlite({ extensions: { btree_gist } });
    await enMemoria.waitReady;
    await prepararBase(enMemoria);
    return enMemoria;
  }

  const huella = huellaMigraciones();
  const anterior = fs.existsSync(ARCHIVO_HUELLA) ? fs.readFileSync(ARCHIVO_HUELLA, "utf8") : null;
  // Si cambiaron las migraciones, la base local se recrea (son datos de prueba).
  if (anterior !== huella && fs.existsSync(DIR_BD)) fs.rmSync(DIR_BD, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });

  const db = new PGlite(DIR_BD, { extensions: { btree_gist } });
  await db.waitReady;
  // La primera migración crea fn_aplicar_permisos: si no está, la base es nueva.
  const existe = await db.query<{ f: string | null }>(`select to_regprocedure('public.fn_aplicar_permisos()')::text as f`);
  if (!existe.rows[0].f) await prepararBase(db);
  fs.writeFileSync(ARCHIVO_HUELLA, huella);
  return db;
}

function baseLocal(): Promise<PGlite> {
  // Si el arranque falla, no se queda la promesa rota para siempre: la siguiente petición lo vuelve a intentar.
  globalThis.__bdLocal ??= iniciar().catch((e) => {
    globalThis.__bdLocal = undefined;
    throw e;
  });
  return globalThis.__bdLocal;
}

export async function crearBdLocal(): Promise<BaseDatos> {
  const almacen = await cookies();
  const db = await baseLocal();
  // Quien entró en ESTA petición (la cookie nueva recién se manda al navegador): así `rpc` ya va con esa sesión.
  let recienEntrado: string | undefined;

  // La demo pública va por HTTPS y su sesión dura un día: es una demo, no una cuenta.
  const opcionesCookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: Boolean(process.env.VERCEL),
    maxAge: SEGUNDOS_DIA * (PUBLICA ? 1 : 30),
  };

  const usuarioId = async (): Promise<string | null> => {
    const id = recienEntrado ?? almacen.get(COOKIE)?.value;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const r = await db.query(`select 1 from auth.users where id = $1`, [id]);
    return r.rows.length ? id : null;
  };

  // Solo desarrollo y demo: aquí no hay contraseñas guardadas. Basta con que exista un usuario con ese correo.
  const entrarComo = async (correo: string): Promise<{ error: string | null }> => {
    const r = await db.query<{ id: string }>(`select id from auth.users where lower(email) = lower($1)`, [correo]);
    if (!r.rows[0]) return { error: "El correo o la contraseña no coinciden. Revísalos." };
    recienEntrado = r.rows[0].id;
    almacen.set(COOKIE, r.rows[0].id, opcionesCookie);
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
        // Al reiniciar la demo vuelven los datos de ejemplo: las fotos de la visita ya no pertenecen a ninguna orden.
        if (PUBLICA && nombre === "reiniciar_demo" && (filas[0].data as { ok?: boolean } | null)?.ok === true) fotosEnMemoria().clear();
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

    // En la demo pública no hay entrada por contraseña: sería una cuenta de dueño abierta a cualquiera.
    entrarConClave: PUBLICA
      ? async () => ({ error: "En la demo pública se entra con «Probar como gerente» o «Probar como jefe de patio»." })
      : (correo) => entrarComo(correo),

    entrarDemo: (quien) => entrarComo(quien === "jefe" ? CORREO_DEMO_JEFE_LOCAL : CORREO_DEMO_LOCAL),

    // Como la sesión anónima de Supabase: un usuario nuevo, sin correo.
    async entrarAnonimo() {
      if (PUBLICA) {
        const total = await db.query<{ n: number }>(`select count(*)::int as n from auth.users`);
        if (total.rows[0].n >= TOPE_USUARIOS_MEMORIA) return { error: "La demo está llena. Inténtalo de nuevo en unos minutos." };
      }
      const r = await db.query<{ id: string }>(`insert into auth.users (email) values (null) returning id`);
      recienEntrado = r.rows[0].id;
      almacen.set(COOKIE, r.rows[0].id, opcionesCookie);
      return { error: null };
    },

    async salir() {
      recienEntrado = undefined;
      almacen.delete(COOKIE);
    },

    // Los «buckets» son carpetas dentro de .local/archivos (o, en la demo pública, entradas en la memoria). Aquí no hay
    // políticas de Storage: quien lee una foto lo hace por la orden (que la base sí protege), y la ruta ya viene
    // validada por la función que la registra.
    async subirArchivo(bucket, ruta, datos) {
      if (!(await usuarioId())) return { error: "Tu sesión se cerró. Vuelve a entrar." };
      if (PUBLICA) {
        if (!rutaValida(bucket, ruta)) return { error: "La ruta del archivo no es válida." };
        const fotos = fotosEnMemoria();
        const clave = `${bucket}/${ruta}`;
        if (!fotos.has(clave)) {
          let usado = 0;
          for (const f of fotos.values()) usado += f.datos.byteLength;
          if (usado + datos.byteLength > TOPE_FOTOS_MEMORIA) {
            return { error: "La demo se llenó de fotos. Reiníciala desde Más → Reiniciar la demo." };
          }
          fotos.set(clave, { datos, tipo: tipoPorRuta(ruta) });
        }
        return { error: null };
      }
      const destino = rutaEnDisco(bucket, ruta);
      if (!destino) return { error: "La ruta del archivo no es válida." };
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      if (!fs.existsSync(/*turbopackIgnore: true*/ destino)) fs.writeFileSync(/*turbopackIgnore: true*/ destino, datos);
      return { error: null };
    },

    async leerArchivo(bucket, ruta) {
      if (!(await usuarioId())) return null;
      return leerArchivoGuardado(bucket, ruta);
    },

    // Como un bucket público: sin sesión. Quien llama ya revisó el permiso con la base.
    async leerArchivoPublico(bucket, ruta) {
      return leerArchivoGuardado(bucket, ruta);
    },
  };
}

function leerArchivoGuardado(bucket: string, ruta: string): { datos: Uint8Array; tipo: string } | null {
  if (PUBLICA) return rutaValida(bucket, ruta) ? (fotosEnMemoria().get(`${bucket}/${ruta}`) ?? null) : null;
  const origen = rutaEnDisco(bucket, ruta);
  if (!origen || !fs.existsSync(/*turbopackIgnore: true*/ origen)) return null;
  return { datos: new Uint8Array(fs.readFileSync(/*turbopackIgnore: true*/ origen)), tipo: tipoPorRuta(origen) };
}
