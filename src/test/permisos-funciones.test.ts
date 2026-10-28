/**
 * Quién puede EJECUTAR qué función. Regla: anon solo publico_*; authenticated todo menos fn_* y requerir_*.
 * Verifica la base real (no los archivos): si una migración olvida fn_aplicar_permisos(), esto lo atrapa.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { como, crearBase, crearUsuario } from "./base-datos";

let db: PGlite;
let usuario: string;

type Funcion = { nombre: string; anon: boolean; autenticado: boolean };

async function funciones(): Promise<Funcion[]> {
  const { rows } = await db.query<Funcion>(`
    select p.proname as nombre,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as autenticado
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
     order by 1`);
  return rows;
}

beforeAll(async () => {
  db = await crearBase();
  usuario = await crearUsuario(db, "alguien@ejemplo.test");
});

afterAll(async () => {
  await db.close();
});

describe("permisos de funciones", () => {
  it("anon solo ejecuta funciones publico_*", async () => {
    const abiertas = (await funciones()).filter((f) => f.anon).map((f) => f.nombre);
    expect(abiertas.filter((n) => !n.startsWith("publico_"))).toEqual([]);
  });

  it("la lista de funciones publico_* es exactamente la esperada", async () => {
    const publicas = (await funciones()).filter((f) => f.nombre.startsWith("publico_")).map((f) => f.nombre);
    expect(publicas).toEqual([
      "publico_enviar_mensaje",
      "publico_olvidar_suscripcion_push",
      "publico_orden",
      "publico_responder_hallazgo",
      "publico_ruta_foto",
      "publico_salud",
      "publico_tomar_aviso",
      "publico_tomar_aviso_mensaje",
    ]);
  });

  it("las funciones internas (fn_*, requerir_*) no las ejecuta la app", async () => {
    const internas = (await funciones()).filter((f) => f.nombre.startsWith("fn_") || f.nombre.startsWith("requerir_"));
    expect(internas.length).toBeGreaterThan(0);
    expect(internas.filter((f) => f.autenticado || f.anon).map((f) => f.nombre)).toEqual([]);
  });

  it("la API del personal sí está abierta a authenticated", async () => {
    const api = (await funciones()).filter((f) => !f.nombre.startsWith("fn_") && !f.nombre.startsWith("requerir_"));
    expect(api.map((f) => f.nombre)).toEqual(
      expect.arrayContaining(["fecha_bogota", "hoy_bogota", "publico_salud", "obtener_contexto", "mi_taller", "es_dueno", "mis_areas", "tiene_area"])
    );
    expect(api.filter((f) => !f.autenticado).map((f) => f.nombre)).toEqual([]);
  });

  it("una función nueva no nace abierta (hay que correr fn_aplicar_permisos)", async () => {
    await db.exec(`create function public.prueba_nueva() returns int language sql as $$ select 1 $$`);
    const fila = (await funciones()).find((f) => f.nombre === "prueba_nueva");
    expect(fila).toMatchObject({ anon: false, autenticado: false });
    await db.exec(`select public.fn_aplicar_permisos()`);
    expect((await funciones()).find((f) => f.nombre === "prueba_nueva")).toMatchObject({ anon: false, autenticado: true });
    await db.exec(`drop function public.prueba_nueva()`);
  });

  it("una publico_* nueva queda abierta a anon y las demás no", async () => {
    await db.exec(`
      create function public.publico_prueba() returns int language sql as $$ select 1 $$;
      create function public.privada_prueba() returns int language sql as $$ select 1 $$;
      select public.fn_aplicar_permisos();
    `);
    const todas = await funciones();
    expect(todas.find((f) => f.nombre === "publico_prueba")).toMatchObject({ anon: true, autenticado: true });
    expect(todas.find((f) => f.nombre === "privada_prueba")).toMatchObject({ anon: false, autenticado: true });
    await db.exec(`drop function public.publico_prueba(); drop function public.privada_prueba();`);
  });

  it("fn_aplicar_permisos no se puede llamar desde la app", async () => {
    await expect(como(db, usuario, `select public.fn_aplicar_permisos()`)).rejects.toMatchObject({ code: "42501" });
    await expect(como(db, null, `select public.fn_aplicar_permisos()`)).rejects.toMatchObject({ code: "42501" });
  });
});
