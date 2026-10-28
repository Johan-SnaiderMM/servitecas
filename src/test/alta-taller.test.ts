/** Alta de un taller de verdad (migración 0004) y su slug. */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { como, crearBase, crearTaller, crearUsuario } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

type Alta = { taller_id: string; nombre: string; dueno: string; slug: string };

async function crear(correo: string, nombre: string, dueno = "Pepe Pérez"): Promise<Alta> {
  const r = await db.query<{ data: Alta }>(`select public.fn_crear_taller($1, $2, $3) as data`, [correo, nombre, dueno]);
  return r.rows[0].data;
}

describe("fn_crear_taller", () => {
  it("crea el taller, el perfil del dueño y los roles iniciales", async () => {
    const id = await crearUsuario(db, "pepe@ejemplo.test");
    const alta = await crear("PEPE@ejemplo.test ", "  Llantas   y Servicios  Pepe ");
    expect(alta).toMatchObject({ nombre: "Llantas y Servicios Pepe", slug: "llantas-y-servicios-pepe" });

    const perfil = await db.query<{ rol: string; nombre: string }>(
      `select rol, nombre from public.perfiles where user_id = $1 and taller_id = $2`,
      [id, alta.taller_id]
    );
    expect(perfil.rows).toEqual([{ rol: "dueno", nombre: "Pepe Pérez" }]);

    const roles = await db.query<{ nombre: string; areas: string[] }>(
      `select nombre, areas from public.roles_equipo where taller_id = $1 order by orden`,
      [alta.taller_id]
    );
    expect(roles.rows).toEqual([
      { nombre: "Jefe de patio", areas: ["recepcion", "patio", "clientes"] },
      { nombre: "Recepción", areas: ["recepcion", "clientes"] },
    ]);

    const taller = await db.query<{ es_demo: boolean }>(`select es_demo from public.talleres where id = $1`, [
      alta.taller_id,
    ]);
    expect(taller.rows[0].es_demo).toBe(false);
  });

  it("no da de alta dos veces al mismo usuario", async () => {
    await crearUsuario(db, "doble@ejemplo.test");
    await crear("doble@ejemplo.test", "Primero");
    await expect(crear("doble@ejemplo.test", "Segundo")).rejects.toThrow(/ya tiene un taller/);
  });

  it("pide que el usuario exista en Authentication", async () => {
    await expect(crear("noexiste@ejemplo.test", "Fantasma")).rejects.toThrow(/No existe el usuario/);
  });

  it("valida el nombre del taller y del dueño", async () => {
    await crearUsuario(db, "val@ejemplo.test");
    await expect(crear("val@ejemplo.test", "   ")).rejects.toThrow(/nombre del taller/);
    await expect(crear("val@ejemplo.test", "x".repeat(61))).rejects.toThrow(/nombre del taller/);
    await expect(crear("val@ejemplo.test", "Válido", " ")).rejects.toThrow(/nombre del dueño/);
  });

  it("no se puede llamar desde la app, ni con sesión ni sin ella", async () => {
    const t = await crearTaller(db, "Taller Gamma");
    await expect(
      como(db, t.userId, `select public.fn_crear_taller('x@ejemplo.test', 'Otro', 'Alguien')`)
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      como(db, null, `select public.fn_crear_taller('x@ejemplo.test', 'Otro', 'Alguien')`)
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("slug", () => {
  it("normaliza tildes y símbolos", async () => {
    const { rows } = await db.query<{ s: string }>(`select public.fn_slug('  ¡Llantas & Frenos — Ñandú Ñ! ') as s`);
    expect(rows[0].s).toBe("llantas-frenos-nandu-n");
  });

  it("agrega -2, -3… cuando el nombre ya existe", async () => {
    for (const c of ["u1", "u2", "u3"]) await crearUsuario(db, `${c}@ejemplo.test`);
    const uno = await crear("u1@ejemplo.test", "Serviteca Real");
    const dos = await crear("u2@ejemplo.test", "Serviteca Real");
    const tres = await crear("u3@ejemplo.test", "Serviteca-Real!");
    expect([uno.slug, dos.slug, tres.slug]).toEqual(["serviteca-real", "serviteca-real-2", "serviteca-real-3"]);
  });

  it("no usa palabras reservadas de la app", async () => {
    await crearUsuario(db, "r1@ejemplo.test");
    expect((await crear("r1@ejemplo.test", "Patio")).slug).toBe("patio-2");
  });

  it("un nombre muy corto recibe un sufijo para llegar a 3 letras", async () => {
    await crearUsuario(db, "c1@ejemplo.test");
    expect((await crear("c1@ejemplo.test", "Ab")).slug).toBe("ab-taller");
  });

  it("un slug escrito a mano debe ser válido", async () => {
    await expect(db.query(`insert into public.talleres (nombre, slug) values ('X', 'Mal Slug')`)).rejects.toMatchObject({
      code: "23514",
    });
  });
});
