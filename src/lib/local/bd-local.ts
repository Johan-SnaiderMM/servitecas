import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { usarDemoCompartida, usarDemoPublica, type BaseDatos, type RespuestaBD } from "@/lib/supabase/servidor";
import { archivosEnDisco, archivosEnMemoria, archivosEnPostgres, type AlmacenArchivos } from "./archivos";
import { huellaMigraciones, reclamosJwt } from "./esquema-supabase";
import { motorDePglite, motorDePostgres, type Motor } from "./motor";
import {
  CORREO_DEMO_JEFE_LOCAL,
  CORREO_DEMO_LOCAL,
  CORREO_LOCAL,
  marcarDemoSembrada,
  prepararBasePostgres,
  renovarDemoSiHaceFalta,
  sembrarBase,
} from "./preparar";

export { CORREO_DEMO_JEFE_LOCAL, CORREO_DEMO_LOCAL, CORREO_LOCAL };

/**
 * MODO LOCAL DE DESARROLLO (DEMO_BD=local): las mismas migraciones y funciones de supabase/, corriendo en
 * un Postgres embebido (PGlite) guardado en .local/. Permite desarrollar y probar la app completa sin
 * cuenta de Supabase. Nunca se usa en producción (ver abrirBD). La "sesión" es una cookie con el id del
 * usuario: solo para desarrollo, y la contraseña no se verifica.
 *
 * DEMO PÚBLICA (DEMO_PUBLICA=1): la misma base abierta al público, con datos ficticios. Dos formas:
 *  - Sin DATABASE_URL: PGlite solo en memoria, para UN proceso (npm start, un contenedor). En un servidor sin estado
 *    (Vercel) no sirve: cada copia de la app tendría su propia base.
 *  - Con DATABASE_URL: una base Postgres compartida (p. ej. Neon). Todas las copias de la app ven los mismos datos, la
 *    sesión (una cookie con el id del usuario) vale en cualquiera y la demo se vuelve a sembrar sola cada pocas horas.
 * Como esto sí corre en producción, se cierra lo que en desarrollo es cómodo: no hay entrada por contraseña (solo los
 * botones de la demo), las fotos tienen tope y los usuarios anónimos también.
 */

const COOKIE = "bd_local_uid";
const DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DEMO_BD_DIR || ".local");
const DIR_BD = path.join(DIR, "pglite");
const DIR_ARCHIVOS = path.join(DIR, "archivos");
const ARCHIVO_HUELLA = path.join(DIR, "huella.txt");

const PUBLICA = usarDemoPublica();
/** Demo pública: cuánto pueden pesar en total las fotos de la visita. */
const TOPE_FOTOS = 40 * 1024 * 1024;
/** Demo pública: cuántos usuarios (con cuenta anónima incluida) caben antes de pedir que vuelvan más tarde. */
const TOPE_USUARIOS = 500;
const SEGUNDOS_DIA = 60 * 60 * 24;
/** Demo compartida: cada cuánto se mira si toca volver a sembrar (como mucho, una vez por minuto por copia). */
const MS_ENTRE_REVISIONES = 60_000;

type Modo = "disco" | "memoria" | "compartida";
type Recursos = { motor: Motor; archivos: AlmacenArchivos; modo: Modo };

declare global {
  var __recursosBdLocal: Promise<Recursos> | undefined;
  var __ultimaRevisionDemo: number | undefined;
}

async function iniciar(): Promise<Recursos> {
  if (usarDemoCompartida()) {
    // `pg` solo se carga aquí: el desarrollo y la demo en memoria no lo necesitan.
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 20_000 });
    // Una conexión ociosa que el servidor cerró no debe tumbar el proceso: el grupo la descarta y abre otra.
    pool.on("error", () => undefined);
    const motor = motorDePostgres(pool);
    await prepararBasePostgres(motor);
    return { motor, archivos: archivosEnPostgres(motor, TOPE_FOTOS), modo: "compartida" };
  }

  if (PUBLICA) {
    const db = new PGlite({ extensions: { btree_gist } });
    await db.waitReady;
    const motor = motorDePglite(db);
    await sembrarBase(motor);
    return { motor, archivos: archivosEnMemoria(TOPE_FOTOS), modo: "memoria" };
  }

  const huella = huellaMigraciones();
  const anterior = fs.existsSync(/*turbopackIgnore: true*/ ARCHIVO_HUELLA) ? fs.readFileSync(/*turbopackIgnore: true*/ ARCHIVO_HUELLA, "utf8") : null;
  // Si cambiaron las migraciones, la base local se recrea (son datos de prueba).
  if (anterior !== huella && fs.existsSync(/*turbopackIgnore: true*/ DIR_BD)) fs.rmSync(/*turbopackIgnore: true*/ DIR_BD, { recursive: true, force: true });
  fs.mkdirSync(/*turbopackIgnore: true*/ DIR, { recursive: true });

  const db = new PGlite(DIR_BD, { extensions: { btree_gist } });
  await db.waitReady;
  const motor = motorDePglite(db);
  // La primera migración crea fn_aplicar_permisos: si no está, la base es nueva.
  const existe = await motor.query<{ f: string | null }>(`select to_regprocedure('public.fn_aplicar_permisos()')::text as f`);
  if (!existe.rows[0].f) await sembrarBase(motor);
  fs.writeFileSync(/*turbopackIgnore: true*/ ARCHIVO_HUELLA, huella);
  return { motor, archivos: archivosEnDisco(DIR_ARCHIVOS), modo: "disco" };
}

function recursos(): Promise<Recursos> {
  // Si el arranque falla, no se queda la promesa rota para siempre: la siguiente petición lo vuelve a intentar.
  globalThis.__recursosBdLocal ??= iniciar().catch((e) => {
    globalThis.__recursosBdLocal = undefined;
    throw e;
  });
  return globalThis.__recursosBdLocal;
}

/** Demo compartida: no se borra sola al reciclarse una copia del servidor, así que se vuelve a sembrar cada pocas horas. */
async function renovarSiToca(motor: Motor): Promise<void> {
  const ahora = Date.now();
  if (ahora - (globalThis.__ultimaRevisionDemo ?? 0) < MS_ENTRE_REVISIONES) return;
  globalThis.__ultimaRevisionDemo = ahora;
  try {
    await renovarDemoSiHaceFalta(motor);
  } catch {
    // Renovar es un lujo: si falla, la petición sigue con los datos que haya.
  }
}

/** Lo que bd-local necesita de las cookies (en Next es `await cookies()`; en las pruebas, un objeto cualquiera). */
export type AlmacenCookies = {
  get(nombre: string): { value: string } | undefined;
  set(nombre: string, valor: string, opciones: { httpOnly: boolean; sameSite: "lax"; path: string; secure: boolean; maxAge: number }): unknown;
  delete(nombre: string): unknown;
};

export async function crearBdLocal(): Promise<BaseDatos> {
  const almacen = await cookies();
  const { motor, archivos, modo } = await recursos();
  if (modo === "compartida") await renovarSiToca(motor);
  return construirBd({ almacen, motor, archivos, publica: PUBLICA, compartida: modo === "compartida" });
}

/** La base de la app sobre un motor y un almacén de fotos cualquiera. Separada de `cookies()` para poder probarla. */
export function construirBd(deps: {
  almacen: AlmacenCookies;
  motor: Motor;
  archivos: AlmacenArchivos;
  publica: boolean;
  compartida: boolean;
}): BaseDatos {
  const { almacen, motor, archivos, publica, compartida } = deps;
  // Quien entró en ESTA petición (la cookie nueva recién se manda al navegador): así `rpc` ya va con esa sesión.
  let recienEntrado: string | undefined;

  // La demo pública va por HTTPS y su sesión dura un día: es una demo, no una cuenta.
  const opcionesCookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: Boolean(process.env.VERCEL),
    maxAge: SEGUNDOS_DIA * (publica ? 1 : 30),
  };

  const usuarioId = async (): Promise<string | null> => {
    const id = recienEntrado ?? almacen.get(COOKIE)?.value;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const r = await motor.query(`select 1 from auth.users where id = $1`, [id]);
    return r.rows.length ? id : null;
  };

  // Solo desarrollo y demo: aquí no hay contraseñas guardadas. Basta con que exista un usuario con ese correo.
  const entrarComo = async (correo: string): Promise<{ error: string | null }> => {
    const r = await motor.query<{ id: string }>(`select id from auth.users where lower(email) = lower($1)`, [correo]);
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
        const filas = await motor.transaction(async (tx) => {
          await tx.exec(`set local role ${actor ? "authenticated" : "anon"}`);
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [reclamosJwt(actor)]);
          // Como PostgREST (Supabase): el resultado sale como JSON. Así una función que devuelve `date` entrega
          // '2026-10-16' (texto) y no un objeto Date de JavaScript.
          const res = await tx.query<{ data: T }>(`select to_jsonb(public.${nombre}(${lista})) as data`, params);
          return res.rows;
        });
        // Al reiniciar la demo vuelven los datos de ejemplo: las fotos de la visita ya no pertenecen a ninguna orden.
        if (publica && nombre === "reiniciar_demo" && (filas[0].data as { ok?: boolean } | null)?.ok === true) {
          if (compartida) await marcarDemoSembrada(motor);
          else await archivos.vaciar();
        }
        return { data: filas[0].data, error: null };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return { data: null, error: { codigo: err.code ?? "", mensaje: err.message ?? "Error" } };
      }
    },

    async usuario() {
      const id = await usuarioId();
      if (!id) return null;
      const r = await motor.query<{ email: string | null }>(`select email from auth.users where id = $1`, [id]);
      return { id, email: r.rows[0]?.email ?? null };
    },

    // En la demo pública no hay entrada por contraseña: sería una cuenta de dueño abierta a cualquiera.
    entrarConClave: publica
      ? async () => ({ error: "En la demo pública se entra con «Probar como gerente» o «Probar como jefe de patio»." })
      : (correo) => entrarComo(correo),

    entrarDemo: (quien) => entrarComo(quien === "jefe" ? CORREO_DEMO_JEFE_LOCAL : CORREO_DEMO_LOCAL),

    // Como la sesión anónima de Supabase: un usuario nuevo, sin correo.
    async entrarAnonimo() {
      if (publica) {
        const total = await motor.query<{ n: number }>(`select count(*)::int as n from auth.users`);
        if (total.rows[0].n >= TOPE_USUARIOS) return { error: "La demo está llena. Inténtalo de nuevo en unos minutos." };
      }
      const r = await motor.query<{ id: string }>(`insert into auth.users (email) values (null) returning id`);
      recienEntrado = r.rows[0].id;
      almacen.set(COOKIE, r.rows[0].id, opcionesCookie);
      return { error: null };
    },

    async salir() {
      recienEntrado = undefined;
      almacen.delete(COOKIE);
    },

    // Los «buckets» son carpetas dentro de .local/archivos, la memoria o una tabla (ver archivos.ts). Aquí no hay
    // políticas de Storage: quien lee una foto lo hace por la orden (que la base sí protege), y la ruta ya viene
    // validada por la función que la registra.
    async subirArchivo(bucket, ruta, datos) {
      if (!(await usuarioId())) return { error: "Tu sesión se cerró. Vuelve a entrar." };
      return archivos.guardar(bucket, ruta, datos);
    },

    async leerArchivo(bucket, ruta) {
      if (!(await usuarioId())) return null;
      return archivos.leer(bucket, ruta);
    },

    // Como un bucket público: sin sesión. Quien llama ya revisó el permiso con la base.
    async leerArchivoPublico(bucket, ruta) {
      return archivos.leer(bucket, ruta);
    },
  };
}
