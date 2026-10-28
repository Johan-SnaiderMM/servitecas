/**
 * Aislamiento entre talleres y escrituras cerradas. Si una de estas pruebas falla, un taller puede ver o tocar los
 * datos de otro: es la regla de seguridad más importante del producto.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { como, crearBase, crearMiembro, crearTaller, crearUsuario, rpc, type TallerDePrueba } from "./base-datos";

let db: PGlite;
let a: TallerDePrueba;
let b: TallerDePrueba;
let jefeA: string;

beforeAll(async () => {
  db = await crearBase();
  a = await crearTaller(db, "Llantas Alfa");
  b = await crearTaller(db, "Serviteca Beta");
  jefeA = await crearMiembro(db, a.tallerId, "Camilo", ["Jefe de patio"]);
});

afterAll(async () => {
  await db.close();
});

describe("lectura aislada por taller", () => {
  it("cada dueño ve solo su taller", async () => {
    const deA = await como<{ id: string }>(db, a.userId, `select id from public.talleres`);
    expect(deA.map((f) => f.id)).toEqual([a.tallerId]);
    const deB = await como<{ id: string }>(db, b.userId, `select id from public.talleres`);
    expect(deB.map((f) => f.id)).toEqual([b.tallerId]);
  });

  it("los perfiles son solo los del propio taller", async () => {
    const filas = await como<{ taller_id: string }>(db, a.userId, `select taller_id from public.perfiles`);
    expect(filas).toHaveLength(2); // el dueño y Camilo
    expect(filas.every((f) => f.taller_id === a.tallerId)).toBe(true);
    expect(await como(db, b.userId, `select 1 from public.perfiles`)).toHaveLength(1);
  });

  it("los roles y sus asignaciones son solo los del propio taller", async () => {
    const roles = await como<{ taller_id: string }>(db, b.userId, `select taller_id from public.roles_equipo`);
    expect(roles).toHaveLength(2);
    expect(roles.every((f) => f.taller_id === b.tallerId)).toBe(true);
    // Camilo es de A: B no ve esa asignación.
    expect(await como(db, b.userId, `select 1 from public.perfil_roles`)).toHaveLength(0);
  });

  it("el jefe de patio también ve solo su taller", async () => {
    const filas = await como<{ id: string }>(db, jefeA, `select id from public.talleres`);
    expect(filas.map((f) => f.id)).toEqual([a.tallerId]);
  });

  it("el contexto trae solo el taller de quien pregunta", async () => {
    const ctx = await rpc<{ taller: { id: string; slug: string }; perfil: { rol: string } }>(db, a.userId, "obtener_contexto");
    expect(ctx.taller).toMatchObject({ id: a.tallerId, slug: a.slug });
    expect(ctx.perfil.rol).toBe("dueno");
  });

  it("alguien sin perfil no ve ningún taller y su contexto viene vacío", async () => {
    const suelto = await crearUsuario(db, "suelto@ejemplo.test");
    expect(await como(db, suelto, `select 1 from public.talleres`)).toHaveLength(0);
    expect(await rpc(db, suelto, "obtener_contexto")).toEqual({ taller: null, perfil: null });
  });
});

describe("sin sesión no se lee nada", () => {
  it.each(["talleres", "perfiles", "roles_equipo", "perfil_roles", "invitaciones"])("anon no lee %s", async (tabla) => {
    await expect(como(db, null, `select * from public.${tabla}`)).rejects.toMatchObject({ code: "42501" });
  });

  it("anon no ejecuta obtener_contexto", async () => {
    await expect(rpc(db, null, "obtener_contexto")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("la app no escribe tablas directamente", () => {
  it("authenticated no puede insertar, actualizar ni borrar", async () => {
    await expect(como(db, a.userId, `insert into public.talleres (nombre) values ('Pirata')`)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(como(db, a.userId, `update public.talleres set nombre = 'Hackeado'`)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(como(db, a.userId, `delete from public.perfiles`)).rejects.toMatchObject({ code: "42501" });
    await expect(
      como(db, a.userId, `update public.perfiles set rol = 'dueno' where user_id = $1`, [jefeA])
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("nadie puede pasarse a sí mismo a otro taller", async () => {
    await expect(
      como(db, jefeA, `update public.perfiles set taller_id = $1 where user_id = $2`, [b.tallerId, jefeA])
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("nadie se da roles a sí mismo escribiendo la tabla", async () => {
    await expect(
      como(
        db,
        jefeA,
        `insert into public.perfil_roles (taller_id, user_id, rol_id)
         select taller_id, $1, id from public.roles_equipo where nombre = 'Recepción'`,
        [jefeA]
      )
    ).rejects.toMatchObject({ code: "42501" });
  });
});
