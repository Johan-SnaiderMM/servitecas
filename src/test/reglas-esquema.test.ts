/**
 * Reglas del esquema que protegen a TODA tabla y migración futura:
 *   - toda tabla de negocio lleva taller_id NOT NULL y RLS;
 *   - ninguna tabla es escribible desde la app (todo va por funciones);
 *   - toda migración que agrega funciones termina corriendo fn_aplicar_permisos();
 *   - supabase/esquema-completo.sql está al día con las migraciones.
 */
import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerMigraciones } from "@/lib/local/esquema-supabase";
// Es el mismo script que corre `npm run esquema`.
import { construir } from "../../scripts/unir-migraciones.mjs";
import { crearBase } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

describe("tablas", () => {
  it("todas tienen RLS activada", async () => {
    const { rows } = await db.query<{ tabla: string }>(`
      select c.relname as tabla
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.tabla)).toEqual([]);
  });

  it("todas (salvo talleres) llevan taller_id NOT NULL", async () => {
    const { rows } = await db.query<{ tabla: string }>(`
      select t.table_name as tabla
        from information_schema.tables t
       where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and t.table_name <> 'talleres'
         and not exists (select 1 from information_schema.columns c
                          where c.table_schema = 'public' and c.table_name = t.table_name
                            and c.column_name = 'taller_id' and c.is_nullable = 'NO')`);
    expect(rows.map((r) => r.tabla)).toEqual([]);
  });

  it("ninguna tabla es escribible por anon ni authenticated", async () => {
    const { rows } = await db.query<{ tabla: string; rol: string; privilegio: string }>(`
      select table_name as tabla, grantee as rol, privilege_type as privilegio
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`);
    expect(rows).toEqual([]);
  });

  it("anon no tiene ningún privilegio sobre tablas", async () => {
    const { rows } = await db.query(`
      select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'`);
    expect(rows).toEqual([]);
  });

  it("una tabla nueva no nace abierta a la app", async () => {
    await db.exec(`create table public.prueba_nueva (id int)`);
    const { rows } = await db.query(`
      select 1 from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'prueba_nueva' and grantee in ('anon', 'authenticated')`);
    expect(rows).toEqual([]);
    await db.exec(`drop table public.prueba_nueva`);
  });
});

const CREA_FUNCION = /create\s+(or\s+replace\s+)?function/gi;

/** true si el SQL no crea funciones, o si corre fn_aplicar_permisos() DESPUÉS de la última que crea. */
function cierraPermisos(sql: string): boolean {
  const posiciones = [...sql.matchAll(CREA_FUNCION)].map((m) => m.index ?? 0);
  if (posiciones.length === 0) return true;
  const ultimoPermiso = sql.lastIndexOf("select public.fn_aplicar_permisos();");
  return ultimoPermiso > posiciones[posiciones.length - 1];
}

describe("migraciones", () => {
  it("la regla de permisos detecta una migración que se olvida de cerrar las funciones", () => {
    const f = "create or replace function public.x() returns int language sql as $$ select 1 $$;";
    expect(cierraPermisos("create table t (id int);")).toBe(true);
    expect(cierraPermisos(f)).toBe(false);
    expect(cierraPermisos(`${f}\nselect public.fn_aplicar_permisos();`)).toBe(true);
    // Una función creada DESPUÉS del último fn_aplicar_permisos() queda abierta por olvido.
    expect(cierraPermisos(`${f}\nselect public.fn_aplicar_permisos();\n${f}`)).toBe(false);
  });

  it("las migraciones que crean funciones terminan con fn_aplicar_permisos()", () => {
    const sinPermisos = leerMigraciones()
      .filter(([, sql]) => !cierraPermisos(sql))
      .map(([nombre]) => nombre);
    expect(sinPermisos).toEqual([]);
  });

  it("tienen nombre con fecha y número, en orden", () => {
    const nombres = leerMigraciones().map(([n]) => n);
    expect(nombres.length).toBeGreaterThan(0);
    for (const n of nombres) expect(n).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect([...nombres].sort()).toEqual(nombres);
  });

  it("supabase/esquema-completo.sql está al día (corre `npm run esquema`)", async () => {
    const archivo = path.join(process.cwd(), "supabase", "esquema-completo.sql");
    expect(fs.existsSync(archivo), "falta supabase/esquema-completo.sql: corre `npm run esquema`").toBe(true);
    const actual = fs.readFileSync(archivo, "utf8").replace(/\r\n/g, "\n");
    expect(actual).toBe(await construir());
  });
});
