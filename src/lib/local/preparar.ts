import { huellaMigraciones, leerMigraciones, SUPABASE_MINIMO } from "./esquema-supabase";
import type { Motor } from "./motor";

/**
 * Cómo se arma una base de demo. Módulo sin dependencias de Next, para poder probarlo contra un Postgres de verdad.
 */

/** Dueño del taller de prueba que se crea solo la primera vez (con fn_crear_taller, como un alta real). */
export const CORREO_LOCAL = "dueno@local.test";
/** Gerente y jefe de patio del taller de DEMO (datos ficticios, migración 0011). */
export const CORREO_DEMO_LOCAL = "demo@local.test";
export const CORREO_DEMO_JEFE_LOCAL = "jefe-demo@local.test";

/** Lo que dice la marca de una base de demo compartida. Sin esta marca, jamás se borra nada. */
export const MARCA_DEMO = "servitecas-demo";
/** Números de los bloqueos entre copias del servidor que arrancan a la vez. */
const BLOQUEO_ARRANQUE = 727_100_001;
const BLOQUEO_RENOVAR = 727_100_002;

type Escribible = Pick<Motor, "query" | "exec">;

/** Esquema mínimo de Supabase, las migraciones, el taller de prueba y la demo (como se dan de alta en producción). */
export async function sembrarBase(db: Escribible, minimo: string = SUPABASE_MINIMO): Promise<void> {
  await db.exec(minimo);
  for (const [, sql] of leerMigraciones()) await db.exec(sql);
  await db.query(`insert into auth.users (email) values ($1), ($2), ($3)`, [CORREO_LOCAL, CORREO_DEMO_LOCAL, CORREO_DEMO_JEFE_LOCAL]);
  await db.query(`select public.fn_crear_taller($1, 'Taller de Prueba', 'Dueño de Prueba')`, [CORREO_LOCAL]);
  // La segunda: la demo, como se da de alta en producción (fn_provisionar_demo).
  await db.query(`select public.fn_provisionar_demo($1, $2)`, [CORREO_DEMO_LOCAL, CORREO_DEMO_JEFE_LOCAL]);
}

const CREAR_ROLES = "create role anon nologin; create role authenticated nologin; create role service_role nologin;";

/**
 * SUPABASE_MINIMO adaptado a un Postgres real y compartido: los roles pueden existir ya (son del servidor, no de la
 * base), y quien se conecta tiene que poder hacer `set role` a ellos para imitar a Supabase.
 */
export function minimoParaPostgres(): string {
  if (!SUPABASE_MINIMO.includes(CREAR_ROLES)) {
    throw new Error("SUPABASE_MINIMO cambió: hay que actualizar minimoParaPostgres().");
  }
  const roles = ["anon", "authenticated", "service_role"];
  const crear = roles
    .map((r) => `if not exists (select 1 from pg_roles where rolname = '${r}') then create role ${r} nologin; end if;`)
    .join(" ");
  return `
    do $$ begin ${crear} end $$;
    grant anon, authenticated, service_role to current_user;
    ${SUPABASE_MINIMO.replace(CREAR_ROLES, "")}
  `;
}

/** Tablas propias de la demo compartida: la marca de la base, cuándo se sembró y las fotos (en la base, no en disco). */
const ESQUEMA_DEMO = `
  create schema demo;
  create table demo.estado (
    marca       text primary key,
    huella      text not null,
    sembrado_en timestamptz not null default now()
  );
  create table demo.archivos (
    clave   text primary key,
    tipo    text not null,
    datos   bytea not null,
    creado  timestamptz not null default now()
  );
`;

/**
 * Deja lista una base Postgres compartida. Es seguro llamarla desde varias copias del servidor a la vez (un bloqueo
 * las pone en fila) y de nuevo en cada arranque (si ya está lista, no hace nada). Todo ocurre en UNA transacción:
 * o queda entera o no queda nada.
 *
 * Nunca toca lo que no es suyo: si la base ya tiene tablas y NO lleva la marca de la demo, se niega. Solo recrea lo
 * suyo cuando cambian las migraciones.
 */
export async function prepararBasePostgres(motor: Motor): Promise<void> {
  const huella = huellaMigraciones();
  await motor.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock($1)`, [BLOQUEO_ARRANQUE]);

    // Dos consultas: Postgres resuelve los nombres al analizar, así que `demo.estado` no puede aparecer en una consulta
    // que se ejecuta cuando todavía no existe (ni siquiera dentro de un CASE).
    const hay = (await tx.query<{ hay: boolean }>(`select to_regclass('demo.estado') is not null as hay`)).rows[0].hay;
    let guardada: string | null = null;
    if (hay) {
      // Si la base lleva la marca de OTRA demo (dos apps conectadas a la misma base por error), no se toca: recrearla
      // borraría los datos de la otra.
      const filas = await tx.query<{ marca: string; huella: string }>(`select marca, huella from demo.estado`);
      const mia = filas.rows.find((f) => f.marca === MARCA_DEMO);
      if (!mia) {
        throw new Error("Esta base de datos pertenece a otra demo y no se toca. Usa una base vacía para DATABASE_URL.");
      }
      guardada = mia.huella;
    }
    if (hay && guardada === huella) return; // ya está lista y al día

    if (hay) {
      // Es nuestra pero las migraciones cambiaron: se recrea SOLO lo nuestro. Los roles no se tocan (son del servidor).
      // Borrar `public` se llevaría por delante una extensión instalada ahí: en ese caso no se arriesga nada.
      const ext = await tx.query<{ extname: string }>(
        `select e.extname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where n.nspname = 'public' and e.extname <> 'plpgsql'`,
      );
      if (ext.rows.length > 0) {
        throw new Error(
          `Las migraciones cambiaron y hay que recrear la base de la demo, pero tiene extensiones en public (${ext.rows.map((r) => r.extname).join(", ")}). Crea una base nueva y vacía.`,
        );
      }
      await tx.exec(`drop schema if exists demo cascade; drop schema if exists storage cascade; drop schema if exists auth cascade; drop schema public cascade; create schema public;`);
    } else {
      const ajenas = await tx.query<{ n: number }>(`select count(*)::int as n from pg_tables where schemaname = 'public'`);
      if (ajenas.rows[0].n > 0) {
        throw new Error(
          "Esta base de datos ya tiene tablas que no son de la demo y no se toca. Usa una base vacía para DATABASE_URL.",
        );
      }
    }

    await sembrarBase(tx, minimoParaPostgres());
    await tx.exec(ESQUEMA_DEMO);
    await tx.query(`insert into demo.estado (marca, huella) values ($1, $2)`, [MARCA_DEMO, huella]);
  });
}

/** Anota que la demo acaba de quedar como nueva (por el reinicio manual desde «Más»): la renovación cuenta desde ahora. */
export async function marcarDemoSembrada(motor: Pick<Motor, "query">): Promise<void> {
  await motor.query(`truncate demo.archivos`);
  await motor.query(`update demo.estado set sembrado_en = now() where marca = $1`, [MARCA_DEMO]);
}

/**
 * La demo compartida no se borra sola cuando se recicla una copia del servidor, como la de memoria: se vuelve a sembrar
 * si lleva más de `maxHoras` desde la última vez. Solo una copia lo hace (un bloqueo); las demás siguen sin esperar.
 * Devuelve true si esta llamada la renovó.
 */
export async function renovarDemoSiHaceFalta(motor: Motor, maxHoras = 3): Promise<boolean> {
  const vieja = await motor.query<{ vieja: boolean }>(
    `select (now() - sembrado_en) > make_interval(hours => $1) as vieja from demo.estado where marca = $2`,
    [maxHoras, MARCA_DEMO],
  );
  if (!vieja.rows[0]?.vieja) return false;
  return motor.transaction(async (tx) => {
    const libre = await tx.query<{ ok: boolean }>(`select pg_try_advisory_xact_lock($1) as ok`, [BLOQUEO_RENOVAR]);
    if (!libre.rows[0].ok) return false; // otra copia ya lo está haciendo
    const sigue = await tx.query<{ vieja: boolean }>(
      `select (now() - sembrado_en) > make_interval(hours => $1) as vieja from demo.estado where marca = $2`,
      [maxHoras, MARCA_DEMO],
    );
    if (!sigue.rows[0]?.vieja) return false;
    await tx.query(`select public.fn_cargar_datos_demo(t.id) from public.talleres t where t.es_demo`);
    await tx.query(`truncate demo.archivos`);
    await tx.query(`update demo.estado set sembrado_en = now() where marca = $1`, [MARCA_DEMO]);
    return true;
  });
}
