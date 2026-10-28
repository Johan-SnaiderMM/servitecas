/**
 * Permisos por área: la lista de SQL y la de TypeScript coinciden, el dueño lo abre todo, los roles se suman,
 * y `requerir_area` rechaza a quien no tiene el área. Los roles viven en la base (0003), no en el JWT.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AREAS } from "@/lib/areas";
import {
  como,
  comoInterno,
  crearBase,
  crearMiembro,
  crearTaller,
  crearUsuario,
  rpc,
  type TallerDePrueba,
} from "./base-datos";

let db: PGlite;
let a: TallerDePrueba;
let b: TallerDePrueba;

beforeAll(async () => {
  db = await crearBase();
  a = await crearTaller(db, "Llantas Alfa");
  b = await crearTaller(db, "Serviteca Beta");
});

afterAll(async () => {
  await db.close();
});

async function areasDe(userId: string): Promise<string[]> {
  const filas = await como<{ areas: string[] }>(db, userId, `select public.mis_areas() as areas`);
  return filas[0].areas;
}

describe("lista de áreas", () => {
  it("SQL (fn_areas) y TypeScript (AREAS) son idénticas y en el mismo orden", async () => {
    const { rows } = await db.query<{ areas: string[] }>(`select public.fn_areas() as areas`);
    expect(rows[0].areas).toEqual([...AREAS]);
  });

  it("toda área tiene su texto para los mensajes de permiso", async () => {
    const { rows } = await db.query<{ area: string; texto: string }>(
      `select a as area, public.fn_texto_area(a) as texto from unnest(public.fn_areas()) a`
    );
    expect(rows.filter((r) => r.texto === "hacer esto").map((r) => r.area)).toEqual([]);
  });

  it("una fila de rol no admite un área inventada", async () => {
    await expect(
      db.query(`insert into public.roles_equipo (taller_id, nombre, areas) values ($1, 'Mago', array['inventada'])`, [
        a.tallerId,
      ])
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("quién abre qué", () => {
  it("el dueño abre todas las áreas", async () => {
    expect(await areasDe(a.userId)).toEqual([...AREAS]);
  });

  it("un jefe de patio registra, trabaja el patio y ve clientes", async () => {
    const id = await crearMiembro(db, a.tallerId, "Camilo", ["Jefe de patio"]);
    expect(await areasDe(id)).toEqual(["recepcion", "patio", "clientes"]);
  });

  it("recepción registra y ve clientes, pero no trabaja el patio", async () => {
    const id = await crearMiembro(db, a.tallerId, "Daniela", ["Recepción"]);
    expect(await areasDe(id)).toEqual(["recepcion", "clientes"]);
  });

  it("varios roles suman sus áreas, sin repetir y en el orden de fn_areas", async () => {
    const id = await crearMiembro(db, a.tallerId, "Esteban", ["Recepción", "Jefe de patio"]);
    expect(await areasDe(id)).toEqual(["recepcion", "patio", "clientes"]);
  });

  it("sin roles no abre ninguna área", async () => {
    expect(await areasDe(await crearMiembro(db, a.tallerId, "Nuevo"))).toEqual([]);
  });

  it("un rol desactivado ya no cuenta", async () => {
    const id = await crearMiembro(db, a.tallerId, "Fabio", ["Recepción"]);
    await db.query(`update public.roles_equipo set activo = false where taller_id = $1 and nombre = 'Recepción'`, [
      a.tallerId,
    ]);
    expect(await areasDe(id)).toEqual([]);
    await db.query(`update public.roles_equipo set activo = true where taller_id = $1 and nombre = 'Recepción'`, [
      a.tallerId,
    ]);
    expect(await areasDe(id)).toEqual(["recepcion", "clientes"]);
  });

  it("alguien sin taller no tiene áreas (null)", async () => {
    const suelto = await crearUsuario(db, "sinperfil@ejemplo.test");
    const filas = await como<{ areas: string[] | null }>(db, suelto, `select public.mis_areas() as areas`);
    expect(filas[0].areas).toBeNull();
  });

  it("el contexto trae las áreas y los nombres de rol", async () => {
    const id = await crearMiembro(db, a.tallerId, "Gina", ["Jefe de patio"]);
    const ctx = await rpc<{ perfil: { areas: string[]; roles: string[]; rol: string } }>(db, id, "obtener_contexto");
    expect(ctx.perfil).toMatchObject({ rol: "equipo", areas: ["recepcion", "patio", "clientes"], roles: ["Jefe de patio"] });
  });
});

describe("requerir_area y tiene_area", () => {
  it("devuelve el taller si la persona abre alguna de las áreas pedidas", async () => {
    const id = await crearMiembro(db, a.tallerId, "Hugo", ["Recepción"]);
    const filas = await comoInterno<{ v: string }>(db, id, `select public.requerir_area('patio', 'recepcion') as v`);
    expect(filas[0].v).toBe(a.tallerId);
  });

  it("rechaza con un mensaje claro si no abre ninguna", async () => {
    const id = await crearMiembro(db, a.tallerId, "Inés", ["Recepción"]);
    await expect(comoInterno(db, id, `select public.requerir_area('patio')`)).rejects.toMatchObject({
      code: "42501",
      message: expect.stringContaining("No tienes permiso para trabajar los vehículos del patio"),
    });
  });

  it("el dueño pasa cualquier área", async () => {
    for (const area of AREAS) {
      const filas = await comoInterno<{ v: string }>(db, a.userId, `select public.requerir_area($1) as v`, [area]);
      expect(filas[0].v).toBe(a.tallerId);
    }
  });

  it("requerir_dueno rechaza al equipo y requerir_taller a quien no tiene taller", async () => {
    const id = await crearMiembro(db, a.tallerId, "Jairo", ["Jefe de patio"]);
    await expect(comoInterno(db, id, `select public.requerir_dueno()`)).rejects.toMatchObject({ code: "42501" });
    const suelto = await crearUsuario(db);
    await expect(comoInterno(db, suelto, `select public.requerir_taller()`)).rejects.toMatchObject({
      code: "42501",
      message: expect.stringContaining("no tiene un taller"),
    });
  });

  it("tiene_area es verdadera solo para las áreas abiertas", async () => {
    const id = await crearMiembro(db, a.tallerId, "Karen", ["Recepción"]);
    const filas = await como<{ si: boolean; no: boolean }>(
      db,
      id,
      `select public.tiene_area('recepcion') as si, public.tiene_area('patio', 'equipo') as no`
    );
    expect(filas[0]).toEqual({ si: true, no: false });
  });
});

describe("los roles no cruzan talleres", () => {
  it("no se puede asignar un rol de otro taller", async () => {
    const id = await crearMiembro(db, a.tallerId, "Laura");
    await expect(
      db.query(
        `insert into public.perfil_roles (taller_id, user_id, rol_id)
         select $1, $2, id from public.roles_equipo where taller_id = $3 and nombre = 'Recepción'`,
        [a.tallerId, id, b.tallerId]
      )
    ).rejects.toMatchObject({ code: "23503" }); // foreign_key_violation (llave compuesta)
  });
});

describe("toda función de escritura pide su área", () => {
  /**
   * Las funciones de la API que escriben (volátiles) deben empezar pidiendo un área (`requerir_area`) o el dueño
   * (`requerir_dueno`). Esta lista fija las que NO lo hacen: si agregas una función de escritura sin permiso, esta
   * prueba falla; si de verdad no lo necesita, agrégala aquí con una razón.
   */
  const SIN_AREA_PERMITIDAS: string[] = [
    // La llama alguien que todavía NO es del equipo (sesión anónima recién abierta): su "permiso" es un código de
    // invitación válido, de un solo uso y de 3 días. Valida que no pertenezca ya a otro taller.
    "canjear_invitacion",
  ];

  it("ninguna función volátil de la API queda sin guardia de permiso", async () => {
    const { rows } = await db.query<{ nombre: string; def: string }>(`
      select p.proname as nombre, pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f' and p.provolatile = 'v'
         and p.proname not like 'fn\\_%' and p.proname not like 'requerir\\_%' and p.proname not like 'publico\\_%'`);
    expect(rows.length).toBeGreaterThan(0);
    const sinGuardia = rows
      .filter((r) => !/requerir_area\(|requerir_dueno\(/.test(r.def))
      .map((r) => r.nombre)
      .sort();
    expect(sinGuardia).toEqual(SIN_AREA_PERMITIDAS);
  });

  it("la API de lectura (estable) no escribe: no hay funciones volátiles ocultas como lectura", async () => {
    const { rows } = await db.query<{ nombre: string }>(`
      select p.proname as nombre
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f' and p.provolatile <> 'v'
         and pg_get_functiondef(p.oid) ~* '\\m(insert into|update public|delete from)\\M'
         and p.proname not like 'fn\\_%'`);
    expect(rows.map((r) => r.nombre)).toEqual([]);
  });
});
