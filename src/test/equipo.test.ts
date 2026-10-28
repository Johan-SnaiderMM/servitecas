/**
 * El equipo entra con un código de invitación (migración 0005, SPEC F1): invitar, canjear, anular, cambiar roles
 * y quitar, sin que nadie dé más permisos de los que tiene.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { como, crearBase, crearMiembro, crearRol, crearTaller, crearUsuario, idRol, rpc, type TallerDePrueba } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

type Equipo = {
  areas: string[];
  roles: { id: string; nombre: string; areas: string[]; personas: number }[];
  personas: { user_id: string; nombre: string; rol: string; yo: boolean; roles: string[]; areas: string[] }[];
  invitaciones: { id: string; nombre: string; codigo: string; expira_at: string; roles: string[] }[];
};

type Canje = { taller: string; nombre: string; areas: string[] };

/** Un taller con un jefe de patio y una recepcionista ya en el equipo. */
type Escenario = TallerDePrueba & { jefe: string; recepcion: string };

let contador = 0;
async function escenario(): Promise<Escenario> {
  contador += 1;
  const t = await crearTaller(db, `Taller ${contador}`);
  const jefe = await crearMiembro(db, t.tallerId, "Camilo", ["Jefe de patio"]);
  const recepcion = await crearMiembro(db, t.tallerId, "Daniela", ["Recepción"]);
  return { ...t, jefe, recepcion };
}

/** Una sesión nueva sin perfil, como la que abre el celular de quien llega con un código (sesión anónima). */
const celularNuevo = () => crearUsuario(db);

const invitar = (actor: string, args: Record<string, unknown>) =>
  rpc<{ id: string; codigo: string; nombre: string; expira_at: string }>(db, actor, "crear_invitacion", args);

const canjear = (actor: string, codigo: string) => rpc<Canje>(db, actor, "canjear_invitacion", { p_codigo: codigo });

const equipo = (actor: string) => rpc<Equipo>(db, actor, "listar_equipo");

/** Quien administra el equipo pero NO es el dueño: roles "equipo" + "catalogo". */
async function encargado(e: Escenario): Promise<string> {
  await crearRol(db, e.tallerId, "Encargado", ["equipo", "catalogo"]);
  return crearMiembro(db, e.tallerId, "Elena", ["Encargado"]);
}

describe("crear_invitacion", () => {
  it("crea un código de 8 caracteres, que sirve 3 días, y lo deja ver a quien administra el equipo", async () => {
    const e = await escenario();
    const jefeDePatio = await idRol(db, e.tallerId, "Jefe de patio");
    const r = await invitar(e.userId, { p_nombre: "  Pedro   Rojas ", p_roles: [jefeDePatio] });

    expect(r.codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(r.nombre).toBe("Pedro Rojas");
    const horas = (new Date(r.expira_at).getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(71.9);
    expect(horas).toBeLessThanOrEqual(72);

    const pendientes = (await equipo(e.userId)).invitaciones;
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toMatchObject({ nombre: "Pedro Rojas", codigo: r.codigo, roles: [jefeDePatio] });
  });

  it.each([
    ["sin nombre", { p_nombre: "  " }, "Escribe el nombre de la persona"],
    ["sin roles", { p_roles: [] }, "Elige al menos un rol"],
  ])("rechaza una invitación %s", async (_caso, extra, mensaje) => {
    const e = await escenario();
    await expect(
      invitar(e.userId, { p_nombre: "Pedro", p_roles: [await idRol(db, e.tallerId, "Recepción")], ...extra })
    ).rejects.toMatchObject({ code: "P0001", message: expect.stringContaining(mensaje) });
  });

  it("rechaza roles que no existen, de otro taller o que no vienen en una lista", async () => {
    const a = await escenario();
    const b = await escenario();
    await expect(
      invitar(a.userId, { p_nombre: "Pedro", p_roles: ["00000000-0000-0000-0000-000000000001"] })
    ).rejects.toMatchObject({ code: "P0002" });
    await expect(
      invitar(a.userId, { p_nombre: "Pedro", p_roles: [await idRol(db, b.tallerId, "Recepción")] })
    ).rejects.toMatchObject({ code: "P0002" });
    await expect(invitar(a.userId, { p_nombre: "Pedro", p_roles: ["no-es-un-id"] })).rejects.toMatchObject({
      code: "P0002",
    });
    await expect(invitar(a.userId, { p_nombre: "Pedro", p_roles: JSON.stringify("recepcion") })).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("Elige los roles"),
    });
  });

  it("limita las invitaciones sin usar (20) y el tamaño del equipo (60)", async () => {
    const e = await escenario();
    const roles = [await idRol(db, e.tallerId, "Recepción")];
    for (let i = 0; i < 20; i++) await invitar(e.userId, { p_nombre: `Persona ${i}`, p_roles: roles });
    await expect(invitar(e.userId, { p_nombre: "Una más", p_roles: roles })).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("muchas invitaciones sin usar"),
    });

    const otro = await escenario();
    const total = (await db.query<{ n: number }>(`select count(*)::int as n from public.perfiles where taller_id = $1`, [otro.tallerId])).rows[0].n;
    for (let i = total; i < 60; i++) await crearMiembro(db, otro.tallerId, `Relleno ${i}`);
    await expect(
      invitar(otro.userId, { p_nombre: "Persona 61", p_roles: [await idRol(db, otro.tallerId, "Recepción")] })
    ).rejects.toMatchObject({ code: "P0001", message: expect.stringContaining("60 personas") });
  });

  it("solo quien tiene el área equipo invita (el dueño y un encargado), no el jefe de patio ni recepción", async () => {
    const e = await escenario();
    const ayudante = await crearRol(db, e.tallerId, "Ayudante", ["catalogo"]);
    await expect(invitar(e.jefe, { p_nombre: "X", p_roles: [ayudante] })).rejects.toMatchObject({ code: "42501" });
    await expect(invitar(e.recepcion, { p_nombre: "X", p_roles: [ayudante] })).rejects.toMatchObject({ code: "42501" });
    await expect(rpc(db, null, "crear_invitacion", { p_nombre: "X", p_roles: [ayudante] })).rejects.toMatchObject({
      code: "42501",
    });
    await expect(invitar(e.userId, { p_nombre: "X", p_roles: [ayudante] })).resolves.toBeTruthy();
    await expect(invitar(await encargado(e), { p_nombre: "Y", p_roles: [ayudante] })).resolves.toBeTruthy();
  });

  it("nadie da más permisos de los que tiene", async () => {
    const e = await escenario();
    const elena = await encargado(e); // equipo + catalogo
    const recepcion = await idRol(db, e.tallerId, "Recepción"); // recepcion + clientes
    await expect(invitar(elena, { p_nombre: "X", p_roles: [recepcion] })).rejects.toMatchObject({
      code: "42501",
      message: expect.stringContaining("No puedes dar permisos que tú no tienes"),
    });
    // El dueño lo da todo.
    await expect(invitar(e.userId, { p_nombre: "Rece", p_roles: [recepcion] })).resolves.toBeTruthy();
  });
});

describe("canjear_invitacion", () => {
  it("crea a la persona en el equipo con sus roles y deja el código usado", async () => {
    const e = await escenario();
    const inv = await invitar(e.userId, { p_nombre: "Pedro Rojas", p_roles: [await idRol(db, e.tallerId, "Jefe de patio")] });
    const celular = await celularNuevo();

    const r = await canjear(celular, inv.codigo);
    expect(r).toMatchObject({ nombre: "Pedro Rojas", areas: ["recepcion", "patio", "clientes"] });

    const ctx = await rpc<{ taller: { id: string }; perfil: { nombre: string; rol: string; roles: string[] } }>(
      db,
      celular,
      "obtener_contexto"
    );
    expect(ctx.taller.id).toBe(e.tallerId);
    expect(ctx.perfil).toMatchObject({ nombre: "Pedro Rojas", rol: "equipo", roles: ["Jefe de patio"] });
    expect((await equipo(e.userId)).invitaciones).toHaveLength(0);
    const { rows } = await db.query(`select 1 from public.invitaciones where codigo = $1 and usada_por = $2`, [
      inv.codigo,
      celular,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("un jefe de patio que entra con su código no administra el equipo", async () => {
    const e = await escenario();
    const inv = await invitar(e.userId, { p_nombre: "Mateo", p_roles: [await idRol(db, e.tallerId, "Jefe de patio")] });
    const celular = await celularNuevo();
    await canjear(celular, inv.codigo);
    await expect(equipo(celular)).rejects.toMatchObject({ code: "42501" });
    await expect(
      invitar(celular, { p_nombre: "Amigo", p_roles: [await idRol(db, e.tallerId, "Recepción")] })
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("acepta el código en minúsculas, con guion o con espacios", async () => {
    const e = await escenario();
    const roles = [await idRol(db, e.tallerId, "Recepción")];
    const a = await invitar(e.userId, { p_nombre: "A", p_roles: roles });
    const b = await invitar(e.userId, { p_nombre: "B", p_roles: roles });
    const c = await invitar(e.userId, { p_nombre: "C", p_roles: roles });
    const bonito = (cod: string) => `${cod.slice(0, 4)}-${cod.slice(4)}`;
    await expect(canjear(await celularNuevo(), bonito(a.codigo))).resolves.toMatchObject({ nombre: "A" });
    await expect(canjear(await celularNuevo(), b.codigo.toLowerCase())).resolves.toMatchObject({ nombre: "B" });
    await expect(canjear(await celularNuevo(), `  ${bonito(c.codigo).toLowerCase()} `)).resolves.toMatchObject({
      nombre: "C",
    });
  });

  it("sirve una sola vez", async () => {
    const e = await escenario();
    const inv = await invitar(e.userId, { p_nombre: "A", p_roles: [await idRol(db, e.tallerId, "Recepción")] });
    await canjear(await celularNuevo(), inv.codigo);
    await expect(canjear(await celularNuevo(), inv.codigo)).rejects.toMatchObject({
      code: "P0002",
      message: expect.stringContaining("Ese código no sirve"),
    });
  });

  it("no sirve vencido, anulado, inventado ni vacío", async () => {
    const e = await escenario();
    const roles = [await idRol(db, e.tallerId, "Recepción")];
    const vencido = await invitar(e.userId, { p_nombre: "A", p_roles: roles });
    await db.query(`update public.invitaciones set expira_at = now() - interval '1 minute' where codigo = $1`, [
      vencido.codigo,
    ]);
    const anulado = await invitar(e.userId, { p_nombre: "B", p_roles: roles });
    await rpc(db, e.userId, "anular_invitacion", { p_id: anulado.id });

    for (const codigo of [vencido.codigo, anulado.codigo, "ZZZZ2222", "", "abc"]) {
      await expect(canjear(await celularNuevo(), codigo), codigo).rejects.toMatchObject({ code: "P0002" });
    }
  });

  it("quien ya está en un equipo no se une a otro sin salir (y el código no se gasta)", async () => {
    const a = await escenario();
    const b = await escenario();
    const inv = await invitar(b.userId, { p_nombre: "A", p_roles: [await idRol(db, b.tallerId, "Recepción")] });
    await expect(canjear(a.recepcion, inv.codigo)).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("ya está en el equipo"),
    });
    await expect(canjear(await celularNuevo(), inv.codigo)).resolves.toBeTruthy();
  });

  it("sin sesión (rol anon) no se puede canjear", async () => {
    const e = await escenario();
    const inv = await invitar(e.userId, { p_nombre: "A", p_roles: [await idRol(db, e.tallerId, "Recepción")] });
    await expect(rpc(db, null, "canjear_invitacion", { p_codigo: inv.codigo })).rejects.toMatchObject({ code: "42501" });
  });
});

describe("anular_invitacion", () => {
  it("anula una pendiente; no una usada ni de otro taller", async () => {
    const a = await escenario();
    const b = await escenario();
    const roles = [await idRol(db, a.tallerId, "Recepción")];
    const pendiente = await invitar(a.userId, { p_nombre: "A", p_roles: roles });
    const usada = await invitar(a.userId, { p_nombre: "B", p_roles: roles });
    await canjear(await celularNuevo(), usada.codigo);

    await expect(rpc(db, b.userId, "anular_invitacion", { p_id: pendiente.id })).rejects.toMatchObject({ code: "P0002" });
    await expect(rpc(db, a.userId, "anular_invitacion", { p_id: usada.id })).rejects.toMatchObject({ code: "P0002" });
    await expect(rpc(db, a.recepcion, "anular_invitacion", { p_id: pendiente.id })).rejects.toMatchObject({
      code: "42501",
    });
    await expect(rpc(db, a.userId, "anular_invitacion", { p_id: pendiente.id })).resolves.toBeTruthy();
    await expect(rpc(db, a.userId, "anular_invitacion", { p_id: pendiente.id })).rejects.toMatchObject({ code: "P0002" });
  });
});

describe("listar_equipo", () => {
  it("trae roles con sus áreas, personas y solo las invitaciones vigentes", async () => {
    const e = await escenario();
    const roles = [await idRol(db, e.tallerId, "Recepción")];
    const vigente = await invitar(e.userId, { p_nombre: "Vigente", p_roles: roles });
    const vencida = await invitar(e.userId, { p_nombre: "Vencida", p_roles: roles });
    await db.query(`update public.invitaciones set expira_at = now() - interval '1 minute' where codigo = $1`, [
      vencida.codigo,
    ]);
    const usada = await invitar(e.userId, { p_nombre: "Usada", p_roles: roles });
    await canjear(await celularNuevo(), usada.codigo);

    const eq = await equipo(e.userId);
    expect(eq.areas).toHaveLength(7);
    expect(eq.roles.map((r) => [r.nombre, r.personas])).toEqual([
      ["Jefe de patio", 1],
      ["Recepción", 2],
    ]);
    expect(eq.invitaciones.map((i) => i.codigo)).toEqual([vigente.codigo]);

    expect(eq.personas[0]).toMatchObject({ rol: "dueno", yo: true });
    expect(eq.personas[0].areas).toHaveLength(7);
    expect(eq.personas.find((p) => p.nombre === "Camilo")).toMatchObject({
      rol: "equipo",
      yo: false,
      areas: ["recepcion", "patio", "clientes"],
    });
    expect(eq.personas.find((p) => p.nombre === "Usada")).toBeTruthy();
  });

  it("solo para quien administra el equipo", async () => {
    const e = await escenario();
    await expect(equipo(e.jefe)).rejects.toMatchObject({ code: "42501" });
    await expect(equipo(await encargado(e))).resolves.toBeTruthy();
  });

  it("la tabla de invitaciones no se lee directamente (el código es una llave)", async () => {
    const e = await escenario();
    await invitar(e.userId, { p_nombre: "A", p_roles: [await idRol(db, e.tallerId, "Recepción")] });
    await expect(como(db, e.userId, `select codigo from public.invitaciones`)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("quitar_del_equipo", () => {
  it("quita a la persona: pierde el acceso al instante", async () => {
    const e = await escenario();
    await rpc(db, e.userId, "quitar_del_equipo", { p_user_id: e.jefe });
    expect(await rpc(db, e.jefe, "obtener_contexto")).toEqual({ taller: null, perfil: null });
    expect(await como(db, e.jefe, `select 1 from public.perfiles`)).toHaveLength(0);
  });

  it("no quita al dueño, ni a uno mismo, ni a alguien de otro taller", async () => {
    const a = await escenario();
    const b = await escenario();
    const elena = await encargado(a);
    await expect(rpc(db, elena, "quitar_del_equipo", { p_user_id: a.userId })).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("dueño"),
    });
    await expect(rpc(db, elena, "quitar_del_equipo", { p_user_id: elena })).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("ti mismo"),
    });
    await expect(rpc(db, b.userId, "quitar_del_equipo", { p_user_id: a.recepcion })).rejects.toMatchObject({
      code: "P0002",
    });
  });

  it("un encargado no quita a alguien con más permisos que él", async () => {
    const e = await escenario();
    const elena = await encargado(e); // equipo + catalogo
    await expect(rpc(db, elena, "quitar_del_equipo", { p_user_id: e.recepcion })).rejects.toMatchObject({
      code: "42501",
      message: expect.stringContaining("más permisos que tú"),
    });
    const ayudante = await crearRol(db, e.tallerId, "Ayudante", ["catalogo"]);
    const juan = await crearMiembro(db, e.tallerId, "Juan");
    await db.query(`insert into public.perfil_roles (taller_id, user_id, rol_id) values ($1, $2, $3)`, [
      e.tallerId,
      juan,
      ayudante,
    ]);
    await expect(rpc(db, elena, "quitar_del_equipo", { p_user_id: juan })).resolves.toBeTruthy();
  });

  it("el jefe de patio y recepción no pueden", async () => {
    const e = await escenario();
    await expect(rpc(db, e.recepcion, "quitar_del_equipo", { p_user_id: e.jefe })).rejects.toMatchObject({ code: "42501" });
    await expect(rpc(db, e.jefe, "quitar_del_equipo", { p_user_id: e.recepcion })).rejects.toMatchObject({ code: "42501" });
  });
});

describe("cambiar_roles_miembro", () => {
  it("deja a la persona con exactamente esos roles (y sus áreas cambian)", async () => {
    const e = await escenario();
    const jefe = await idRol(db, e.tallerId, "Jefe de patio");
    const recepcion = await idRol(db, e.tallerId, "Recepción");
    const r = await rpc<{ areas: string[] }>(db, e.userId, "cambiar_roles_miembro", {
      p_user_id: e.recepcion,
      p_roles: [jefe, recepcion],
    });
    expect(r.areas).toEqual(["recepcion", "patio", "clientes"]);
    await rpc(db, e.userId, "cambiar_roles_miembro", { p_user_id: e.jefe, p_roles: [recepcion] });
    expect(await rpc<string[]>(db, e.jefe, "mis_areas")).toEqual(["recepcion", "clientes"]);
  });

  it("pide al menos un rol, roles reales, y no toca al dueño ni a uno mismo", async () => {
    const e = await escenario();
    const ayudante = await crearRol(db, e.tallerId, "Ayudante", ["catalogo"]);
    await expect(rpc(db, e.userId, "cambiar_roles_miembro", { p_user_id: e.jefe, p_roles: [] })).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("al menos un rol"),
    });
    await expect(
      rpc(db, e.userId, "cambiar_roles_miembro", { p_user_id: e.jefe, p_roles: ["00000000-0000-0000-0000-000000000001"] })
    ).rejects.toMatchObject({ code: "P0002" });
    const elena = await encargado(e);
    await expect(
      rpc(db, elena, "cambiar_roles_miembro", { p_user_id: e.userId, p_roles: [ayudante] })
    ).rejects.toMatchObject({ code: "P0001", message: expect.stringContaining("dueño") });
    await expect(
      rpc(db, elena, "cambiar_roles_miembro", { p_user_id: elena, p_roles: [ayudante] })
    ).rejects.toMatchObject({ code: "P0001", message: expect.stringContaining("tus propios roles") });
  });

  it("un encargado no asciende a otro ni toca a quien tiene permisos que él no tiene", async () => {
    const e = await escenario();
    const elena = await encargado(e);
    const recepcion = await idRol(db, e.tallerId, "Recepción");
    const ayudante = await crearRol(db, e.tallerId, "Ayudante", ["catalogo"]);
    const juan = await crearMiembro(db, e.tallerId, "Juan", ["Ayudante"]);

    await expect(
      rpc(db, elena, "cambiar_roles_miembro", { p_user_id: juan, p_roles: [recepcion] })
    ).rejects.toMatchObject({ code: "42501", message: expect.stringContaining("No puedes dar permisos que tú no tienes") });
    await expect(
      rpc(db, elena, "cambiar_roles_miembro", { p_user_id: e.jefe, p_roles: [ayudante] })
    ).rejects.toMatchObject({ code: "42501" });
  });
});
