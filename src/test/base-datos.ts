/**
 * Postgres REAL en memoria (PGlite) con lo mínimo de Supabase que las migraciones dan por existente
 * (roles anon/authenticated, auth.uid()/auth.jwt(), privilegios por defecto) y TODAS las migraciones
 * de supabase/migrations aplicadas. Sirve para probar el SQL y el RLS de verdad, sin Docker.
 *
 * Cada llamada de `como()` simula una petición de Supabase: abre una transacción, cambia al rol
 * `authenticated` (o `anon`) y fija el JWT; si la función falla, se revierte todo.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { leerMigraciones, reclamosJwt, SUPABASE_MINIMO } from "@/lib/local/esquema-supabase";

export const MIGRACIONES = leerMigraciones().map(([nombre]) => nombre);

/** btree_gist va cargada desde ya, igual que en el modo local (por si una restricción de exclusión la necesita). */
export async function crearBase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_MINIMO);
  for (const [, sql] of leerMigraciones()) await db.exec(sql);
  return db;
}

/** Crea un usuario en auth.users y devuelve su id. Sin correo = como la sesión anónima de quien llega con un código. */
export async function crearUsuario(db: PGlite, correo: string | null = null): Promise<string> {
  const u = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [correo]);
  return u.rows[0].id;
}

/** Un correo de prueba único a partir de un nombre. */
function correoDe(nombre: string): string {
  return `${nombre.toLowerCase().replace(/\W+/g, "-")}-${Math.random().toString(36).slice(2, 8)}@ejemplo.test`;
}

export type TallerDePrueba = { userId: string; tallerId: string; slug: string; correo: string };

/** Crea el usuario del dueño y le da de alta un taller de verdad (fn_crear_taller). */
export async function crearTaller(db: PGlite, nombre: string): Promise<TallerDePrueba> {
  const correo = correoDe(nombre);
  const userId = await crearUsuario(db, correo);
  const r = await db.query<{ data: { taller_id: string; slug: string } }>(
    `select public.fn_crear_taller($1, $2, $3) as data`,
    [correo, nombre, `Dueño de ${nombre}`.slice(0, 40)]
  );
  return { userId, tallerId: r.rows[0].data.taller_id, slug: r.rows[0].data.slug, correo };
}

/** Crea un rol de equipo con las áreas dadas (los iniciales son Jefe de patio y Recepción). Devuelve su id. */
export async function crearRol(db: PGlite, tallerId: string, nombre: string, areas: string[]): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.roles_equipo (taller_id, nombre, areas) values ($1, $2, $3) returning id`,
    [tallerId, nombre, areas]
  );
  return r.rows[0].id;
}

/** Id de un rol del taller por su nombre. */
export async function idRol(db: PGlite, tallerId: string, nombre: string): Promise<string> {
  const r = await db.query<{ id: string }>(`select id from public.roles_equipo where taller_id = $1 and nombre = $2`, [
    tallerId,
    nombre,
  ]);
  return r.rows[0].id;
}

/**
 * Agrega a alguien del equipo (no dueño) con los roles que se nombren. Inserta directo como dueño de la base, sin
 * pasar por la invitación: sirve para armar escenarios. La invitación por código se prueba en equipo.test.ts.
 */
export async function crearMiembro(db: PGlite, tallerId: string, nombre: string, roles: string[] = []): Promise<string> {
  const userId = await crearUsuario(db, correoDe(nombre));
  await db.query(`insert into public.perfiles (user_id, taller_id, rol, nombre) values ($1, $2, 'equipo', $3)`, [
    userId,
    tallerId,
    nombre,
  ]);
  for (const rol of roles) {
    await db.query(
      `insert into public.perfil_roles (taller_id, user_id, rol_id)
       select $1, $2, id from public.roles_equipo where taller_id = $1 and nombre = $3`,
      [tallerId, userId, rol]
    );
  }
  return userId;
}

/** Quién hace la petición: un usuario con sesión o nadie (rol anon). */
export type Actor = string | null;

/** Ejecuta SQL como `actor` (una petición = una transacción). Lanza si la base rechaza. */
export async function como<T extends Record<string, unknown> = Record<string, unknown>>(
  db: PGlite,
  actor: Actor,
  texto: string,
  params: unknown[] = []
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${actor ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [reclamosJwt(actor)]);
    const res = await tx.query<T>(texto, params);
    return res.rows;
  });
}

/**
 * Como `como`, pero SIN cambiar de rol: corre con los privilegios del dueño de la base y solo fija quién es
 * auth.uid(). Sirve para probar funciones internas (requerir_*, fn_*) que la app nunca llama directo.
 */
export async function comoInterno<T extends Record<string, unknown> = Record<string, unknown>>(
  db: PGlite,
  actor: Actor,
  texto: string,
  params: unknown[] = []
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [reclamosJwt(actor)]);
    const res = await tx.query<T>(texto, params);
    return res.rows;
  });
}

/** Llama a una función pública como lo haría `supabase.rpc(nombre, args)`; devuelve su jsonb. */
export async function rpc<T = unknown>(
  db: PGlite,
  actor: Actor,
  nombre: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const claves = Object.keys(args);
  const lista = claves
    .map((k, i) => {
      const v = args[k];
      return `${k} => $${i + 1}${v !== null && typeof v === "object" ? "::jsonb" : ""}`;
    })
    .join(", ");
  const params = claves.map((k) => {
    const v = args[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const filas = await como<{ data: T }>(db, actor, `select public.${nombre}(${lista}) as data`, params);
  return filas[0].data;
}
