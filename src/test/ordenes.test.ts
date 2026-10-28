/**
 * Clientes, vehículos y órdenes (migración 0006, SPEC F2 y F5): registro rápido, estados, asignación, aislamiento
 * entre talleres y el enlace del cliente. Las reglas de placa, celular y estados se comparan con las de TypeScript.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESTADOS } from "@/lib/ordenes";
import { ERROR_PLACA, ERROR_PLACA_VACIA } from "@/lib/placa";
import { ERROR_TELEFONO } from "@/lib/telefono";
import { CASOS_PLACA } from "./casos-placa";
import { CASOS_TELEFONO } from "./casos-telefono";
import { como, crearBase, crearMiembro, crearRol, crearTaller, rpc, type TallerDePrueba } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

type Escenario = TallerDePrueba & { jefe: string; recepcion: string; ayudante: string };

let contador = 0;
/** Un taller con un jefe de patio, una recepcionista y alguien que solo maneja la lista de hallazgos. */
async function escenario(): Promise<Escenario> {
  contador += 1;
  const t = await crearTaller(db, `Serviteca ${contador}`);
  const jefe = await crearMiembro(db, t.tallerId, "Camilo Ruiz", ["Jefe de patio"]);
  const recepcion = await crearMiembro(db, t.tallerId, "Daniela", ["Recepción"]);
  await crearRol(db, t.tallerId, "Ayudante", ["catalogo"]);
  const ayudante = await crearMiembro(db, t.tallerId, "Ana", ["Ayudante"]);
  return { ...t, jefe, recepcion, ayudante };
}

type Recibida = { id: string; numero: number; token: string; repetida: boolean };

const clave = () => crypto.randomUUID();

const recibir = (actor: string | null, args: Record<string, unknown>) =>
  rpc<Recibida>(db, actor, "recibir_vehiculo", {
    p_clave: clave(),
    p_placa: "ABC123",
    p_celular: "300 123 4567",
    p_servicio: "Alineación y balanceo",
    ...args,
  });

type Orden = {
  id: string;
  numero: number;
  token: string;
  estado: string;
  servicio: string;
  entregado_at: string | null;
  motivo_cancelacion: string | null;
  vehiculo: { placa: string; tipo: string };
  cliente: { nombre: string | null; celular: string };
  asignado: { user_id: string; nombre: string } | null;
  mia: boolean;
  eventos: { tipo: string; estado: string | null; detalle: string | null; autor: string | null }[];
};

const orden = (actor: string, id: string) => rpc<Orden>(db, actor, "obtener_orden", { p_id: id });
const estado = (actor: string, id: string, e: string) => rpc(db, actor, "cambiar_estado_orden", { p_id: id, p_estado: e });

describe("normalización: SQL y TypeScript usan la misma regla", () => {
  it.each(CASOS_PLACA)("placa %j -> %j", async (entrada, esperado) => {
    const sql = db.query<{ v: string }>(`select public.fn_normalizar_placa($1) as v`, [entrada]);
    if (esperado === "VACIA") await expect(sql).rejects.toMatchObject({ message: ERROR_PLACA_VACIA });
    else if (esperado === "ERROR") await expect(sql).rejects.toMatchObject({ message: ERROR_PLACA });
    else expect((await sql).rows[0].v).toBe(esperado);
  });

  it.each(CASOS_TELEFONO)("celular %j -> %j", async (entrada, esperado) => {
    const sql = db.query<{ v: string | null }>(`select public.fn_normalizar_telefono($1) as v`, [entrada]);
    if (esperado === "ERROR") await expect(sql).rejects.toMatchObject({ message: ERROR_TELEFONO });
    else expect((await sql).rows[0].v).toBe(esperado);
  });

  it("los estados de SQL (fn_estados) y de TypeScript (ESTADOS) son idénticos", async () => {
    const { rows } = await db.query<{ e: string[] }>(`select public.fn_estados() as e`);
    expect(rows[0].e).toEqual([...ESTADOS]);
  });

  it("el tipo de vehículo sale de la forma de la placa", async () => {
    const e = await escenario();
    await recibir(e.userId, { p_placa: "abc123" });
    await recibir(e.userId, { p_placa: "xyz12d", p_celular: "3101112233" });
    await recibir(e.userId, { p_placa: "AB1234", p_celular: "3101112234" });
    const { rows } = await db.query<{ placa: string; tipo: string }>(
      `select placa, tipo from public.vehiculos where taller_id = $1 order by placa`,
      [e.tallerId]
    );
    expect(rows).toEqual([
      { placa: "AB1234", tipo: "otro" },
      { placa: "ABC123", tipo: "carro" },
      { placa: "XYZ12D", tipo: "moto" },
    ]);
  });
});

describe("recibir_vehiculo", () => {
  it("crea cliente, vehículo y la orden #1 con su enlace, recibida y en la historia", async () => {
    const e = await escenario();
    const r = await recibir(e.recepcion, { p_placa: " abc-123 ", p_nombre: "  Juan   Pérez ", p_kilometraje: 45200 });
    expect(r).toMatchObject({ numero: 1, repetida: false });
    expect(r.token).toMatch(/^[0-9a-f-]{36}$/);

    const o = await orden(e.userId, r.id);
    expect(o).toMatchObject({
      numero: 1,
      estado: "recibido",
      servicio: "Alineación y balanceo",
      vehiculo: { placa: "ABC123", tipo: "carro" },
      cliente: { nombre: "Juan Pérez", celular: "+573001234567" },
      asignado: null,
    });
    expect(o.eventos).toEqual([{ tipo: "creada", estado: "recibido", detalle: null, autor: "Daniela", at: expect.any(String) }]);
  });

  it("numera por taller: cada taller empieza en 1", async () => {
    const a = await escenario();
    const b = await escenario();
    expect((await recibir(a.userId, { p_placa: "AAA111" })).numero).toBe(1);
    expect((await recibir(a.userId, { p_placa: "AAA112" })).numero).toBe(2);
    expect((await recibir(b.userId, { p_placa: "AAA111" })).numero).toBe(1);
  });

  it("un reintento con la misma clave devuelve la misma orden (no la duplica)", async () => {
    const e = await escenario();
    const k = clave();
    const uno = await recibir(e.userId, { p_clave: k });
    const dos = await recibir(e.userId, { p_clave: k, p_placa: "OTR999" });
    expect(dos).toMatchObject({ id: uno.id, numero: uno.numero, repetida: true });
    const { rows } = await db.query(`select 1 from public.ordenes where taller_id = $1`, [e.tallerId]);
    expect(rows).toHaveLength(1);
  });

  it("la misma clave usada en otro taller no revela ni devuelve nada", async () => {
    const a = await escenario();
    const b = await escenario();
    const k = clave();
    await recibir(a.userId, { p_clave: k });
    await expect(recibir(b.userId, { p_clave: k })).rejects.toMatchObject({ code: "P0001" });
  });

  it("un vehículo con una orden abierta no se recibe otra vez; entregado, sí", async () => {
    const e = await escenario();
    const r = await recibir(e.userId, {});
    await expect(recibir(e.userId, { p_placa: "abc 123" })).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("ya está en el patio (orden #1)"),
    });
    await estado(e.userId, r.id, "entregado");
    expect((await recibir(e.userId, {})).numero).toBe(2);
  });

  it("si el vehículo llega con otro celular, queda con ese cliente; el celular conocido conserva su nombre", async () => {
    const e = await escenario();
    const r1 = await recibir(e.userId, { p_nombre: "Juan" });
    await estado(e.userId, r1.id, "entregado");
    const r2 = await recibir(e.userId, { p_celular: "311 222 3344", p_nombre: "Luisa" });
    expect((await orden(e.userId, r2.id)).cliente).toEqual({ nombre: "Luisa", celular: "+573112223344" });
    await estado(e.userId, r2.id, "entregado");
    // Vuelve Juan con su celular y sin escribir el nombre: se le reconoce.
    const r3 = await recibir(e.userId, { p_nombre: "" });
    expect((await orden(e.userId, r3.id)).cliente).toEqual({ nombre: "Juan", celular: "+573001234567" });
  });

  it.each([
    ["sin placa", { p_placa: " " }, "Escribe la placa"],
    ["con placa inválida", { p_placa: "AB" }, "La placa no es válida"],
    ["sin celular", { p_celular: "" }, "Escribe el celular del cliente"],
    ["con celular inválido", { p_celular: "12345" }, "El celular no es válido"],
    ["sin servicio", { p_servicio: "   " }, "Escribe qué servicio"],
    ["con kilometraje negativo", { p_kilometraje: -1 }, "kilometraje no es válido"],
  ])("rechaza un vehículo %s", async (_caso, extra, mensaje) => {
    const e = await escenario();
    await expect(recibir(e.userId, extra)).rejects.toMatchObject({ code: "P0001", message: expect.stringContaining(mensaje) });
  });

  it("recepción y el jefe de patio reciben; quien no tiene el área ni un visitante sin sesión, no", async () => {
    const e = await escenario();
    await expect(recibir(e.recepcion, { p_placa: "REC111" })).resolves.toBeTruthy();
    await expect(recibir(e.jefe, { p_placa: "JEF111" })).resolves.toBeTruthy();
    await expect(recibir(e.ayudante, { p_placa: "AYU111" })).rejects.toMatchObject({ code: "42501" });
    await expect(recibir(null, { p_placa: "ANO111" })).rejects.toMatchObject({ code: "42501" });
  });
});

describe("asignar_orden", () => {
  it("al recibir o después, a un jefe de patio o al dueño; queda en la historia", async () => {
    const e = await escenario();
    const r = await recibir(e.recepcion, { p_asignado: e.jefe });
    let o = await orden(e.jefe, r.id);
    expect(o.asignado).toEqual({ user_id: e.jefe, nombre: "Camilo Ruiz" });
    expect(o.mia).toBe(true);

    await rpc(db, e.recepcion, "asignar_orden", { p_id: r.id, p_user: e.userId });
    await rpc(db, e.recepcion, "asignar_orden", { p_id: r.id, p_user: null });
    o = await orden(e.userId, r.id);
    expect(o.asignado).toBeNull();
    expect(o.eventos.filter((x) => x.tipo === "asignacion").map((x) => x.detalle)).toEqual([
      "Camilo Ruiz",
      expect.stringContaining("Dueño de Serviteca"),
      "Sin asignar",
    ]);
  });

  it("no se asigna a quien no trabaja el patio ni a alguien de otro taller", async () => {
    const a = await escenario();
    const b = await escenario();
    const r = await recibir(a.userId, {});
    for (const user of [a.recepcion, a.ayudante, b.jefe]) {
      await expect(rpc(db, a.userId, "asignar_orden", { p_id: r.id, p_user: user })).rejects.toMatchObject({
        code: "P0001",
        message: expect.stringContaining("debe ser jefe de patio"),
      });
    }
    await expect(recibir(a.userId, { p_placa: "OTR111", p_asignado: a.recepcion })).rejects.toMatchObject({ code: "P0001" });
  });

  it("si el jefe sale del equipo, sus órdenes quedan sin asignar", async () => {
    const e = await escenario();
    const r = await recibir(e.userId, { p_asignado: e.jefe });
    await rpc(db, e.userId, "quitar_del_equipo", { p_user_id: e.jefe });
    expect((await orden(e.userId, r.id)).asignado).toBeNull();
  });
});

describe("cambiar_estado_orden y cancelar_orden", () => {
  it("avanza, puede volver entre los abiertos y al entregar guarda la hora", async () => {
    const e = await escenario();
    const r = await recibir(e.userId, {});
    for (const x of ["diagnostico", "en_proceso", "diagnostico", "en_proceso", "listo"]) await estado(e.jefe, r.id, x);
    expect(await estado(e.recepcion, r.id, "listo")).toMatchObject({ cambio: false });
    await estado(e.recepcion, r.id, "entregado");

    const o = await orden(e.userId, r.id);
    expect(o.estado).toBe("entregado");
    expect(o.entregado_at).not.toBeNull();
    expect(o.eventos.map((x) => x.estado)).toEqual([
      "recibido",
      "diagnostico",
      "en_proceso",
      "diagnostico",
      "en_proceso",
      "listo",
      "entregado",
    ]);
    expect(o.eventos.at(-1)?.autor).toBe("Daniela");
  });

  it("una orden entregada o cancelada ya no cambia", async () => {
    const e = await escenario();
    const r1 = await recibir(e.userId, { p_placa: "AAA111" });
    await estado(e.userId, r1.id, "entregado");
    await expect(estado(e.userId, r1.id, "listo")).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("ya está cerrada (entregada)"),
    });
    const r2 = await recibir(e.userId, { p_placa: "AAA222" });
    await rpc(db, e.userId, "cancelar_orden", { p_id: r2.id, p_motivo: "El cliente se lo llevó" });
    await expect(estado(e.userId, r2.id, "recibido")).rejects.toMatchObject({ message: expect.stringContaining("cancelada") });
    await expect(rpc(db, e.userId, "asignar_orden", { p_id: r2.id, p_user: e.jefe })).rejects.toMatchObject({ code: "P0001" });
  });

  it("rechaza estados inventados y cancelar sin motivo", async () => {
    const e = await escenario();
    const r = await recibir(e.userId, {});
    await expect(estado(e.userId, r.id, "perdido")).rejects.toMatchObject({ message: expect.stringContaining("no existe") });
    await expect(estado(e.userId, r.id, "cancelada")).rejects.toMatchObject({ message: expect.stringContaining("motivo") });
    await expect(rpc(db, e.userId, "cancelar_orden", { p_id: r.id, p_motivo: " x " })).rejects.toMatchObject({
      message: expect.stringContaining("por qué se cancela"),
    });
    await rpc(db, e.userId, "cancelar_orden", { p_id: r.id, p_motivo: "  Se equivocaron   de placa " });
    const o = await orden(e.userId, r.id);
    expect(o).toMatchObject({ estado: "cancelada", motivo_cancelacion: "Se equivocaron de placa" });
    expect(o.eventos.at(-1)).toMatchObject({ tipo: "cancelada", estado: "cancelada", detalle: "Se equivocaron de placa" });
  });

  it("quien no trabaja vehículos no cambia estados", async () => {
    const e = await escenario();
    const r = await recibir(e.userId, {});
    await expect(estado(e.ayudante, r.id, "listo")).rejects.toMatchObject({ code: "42501" });
    await expect(rpc(db, e.ayudante, "cancelar_orden", { p_id: r.id, p_motivo: "Porque sí" })).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("aislamiento entre talleres", () => {
  it("un taller no ve, no cambia ni lista las órdenes de otro", async () => {
    const a = await escenario();
    const b = await escenario();
    const r = await recibir(a.userId, {});
    await expect(orden(b.userId, r.id)).rejects.toMatchObject({ code: "P0002" });
    await expect(estado(b.userId, r.id, "listo")).rejects.toMatchObject({ code: "P0002" });
    await expect(rpc(db, b.userId, "cancelar_orden", { p_id: r.id, p_motivo: "Intruso" })).rejects.toMatchObject({
      code: "P0002",
    });
    expect((await rpc<{ abiertas: unknown[] }>(db, b.userId, "listar_ordenes")).abiertas).toEqual([]);
    expect(await rpc(db, b.userId, "buscar_vehiculo", { p_placa: "ABC123" })).toMatchObject({ existe: false });
    for (const tabla of ["clientes", "vehiculos", "ordenes", "orden_eventos"]) {
      expect(await como(db, b.userId, `select 1 from public.${tabla}`), tabla).toHaveLength(0);
    }
  });

  it("dentro del taller, las tablas las lee quien maneja vehículos, no cualquiera", async () => {
    const e = await escenario();
    await recibir(e.userId, {});
    expect(await como(db, e.recepcion, `select 1 from public.ordenes`)).toHaveLength(1);
    expect(await como(db, e.ayudante, `select 1 from public.ordenes`)).toHaveLength(0);
    expect(await como(db, e.ayudante, `select 1 from public.clientes`)).toHaveLength(0);
    for (const tabla of ["clientes", "vehiculos", "ordenes", "orden_eventos"]) {
      await expect(como(db, null, `select 1 from public.${tabla}`), tabla).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("nada se borra: ni siquiera el dueño de la base borra una orden", async () => {
    const e = await escenario();
    const r = await recibir(e.userId, {});
    await expect(db.query(`delete from public.ordenes where id = $1`, [r.id])).rejects.toMatchObject({ code: "42501" });
    await expect(como(db, e.userId, `delete from public.ordenes where id = $1`, [r.id])).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("lecturas del personal", () => {
  it("buscar_vehiculo trae al cliente, las visitas y la orden abierta; lo incompleto no es error", async () => {
    const e = await escenario();
    const r = await recibir(e.userId, { p_nombre: "Juan" });
    expect(await rpc(db, e.recepcion, "buscar_vehiculo", { p_placa: "abc-123" })).toEqual({
      existe: true,
      placa: "ABC123",
      tipo: "carro",
      cliente: { nombre: "Juan", celular: "+573001234567" },
      visitas: 1,
      orden_abierta: { id: r.id, numero: 1, estado: "recibido" },
    });
    expect(await rpc(db, e.recepcion, "buscar_vehiculo", { p_placa: "AB" })).toEqual({ existe: false });
    expect(await rpc(db, e.recepcion, "buscar_vehiculo", { p_placa: "ZZZ999" })).toEqual({ existe: false, placa: "ZZZ999" });
    await expect(rpc(db, e.ayudante, "buscar_vehiculo", { p_placa: "ABC123" })).rejects.toMatchObject({ code: "42501" });
  });

  it("listar_ordenes trae solo las abiertas, de la más vieja a la más nueva, y marca las mías", async () => {
    const e = await escenario();
    const r1 = await recibir(e.userId, { p_placa: "AAA111", p_asignado: e.jefe });
    const r2 = await recibir(e.userId, { p_placa: "AAA222" });
    const r3 = await recibir(e.userId, { p_placa: "AAA333" });
    await estado(e.userId, r3.id, "entregado");

    const l = await rpc<{ abiertas: { id: string; mia: boolean; asignado: unknown }[]; entregadas_hoy: number }>(
      db,
      e.jefe,
      "listar_ordenes"
    );
    expect(l.abiertas.map((o) => o.id)).toEqual([r1.id, r2.id]);
    expect(l.abiertas.map((o) => o.mia)).toEqual([true, false]);
    expect(l.entregadas_hoy).toBe(1);
    await expect(rpc(db, e.ayudante, "listar_ordenes")).rejects.toMatchObject({ code: "42501" });
  });

  it("listar_jefes_patio trae a quien abre el patio (el dueño incluido), no a recepción", async () => {
    const e = await escenario();
    await recibir(e.userId, { p_asignado: e.jefe });
    const jefes = await rpc<{ user_id: string; nombre: string; yo: boolean; abiertas: number }[]>(
      db,
      e.jefe,
      "listar_jefes_patio"
    );
    expect(jefes.map((j) => j.user_id).sort()).toEqual([e.jefe, e.userId].sort());
    expect(jefes[0]).toMatchObject({ user_id: e.jefe, yo: true, abiertas: 1 });
  });
});

describe("enlace del cliente (publico_orden)", () => {
  type Publica = {
    existe: boolean;
    taller?: { nombre: string; whatsapp: string | null };
    orden?: { numero: number; placa: string; estado: string; cliente: string | null; atiende: string | null; historia: { estado: string }[] };
  };

  it("un visitante sin sesión ve su orden con el token, sin celulares ni apellidos", async () => {
    const e = await escenario();
    const r = await recibir(e.recepcion, { p_nombre: "Juan Pérez", p_asignado: e.jefe });
    await estado(e.jefe, r.id, "diagnostico");

    const p = await rpc<Publica>(db, null, "publico_orden", { p_token: r.token });
    expect(p).toMatchObject({
      existe: true,
      taller: { nombre: expect.stringContaining("Serviteca"), whatsapp: null },
      orden: { numero: 1, placa: "ABC123", estado: "diagnostico", cliente: "Juan", atiende: "Camilo" },
    });
    expect(p.orden!.historia.map((h) => h.estado)).toEqual(["recibido", "diagnostico"]);
    const texto = JSON.stringify(p);
    expect(texto).not.toContain("300");
    expect(texto).not.toContain("Pérez");
    expect(texto).not.toContain("Ruiz");
  });

  it("un token que no existe no dice nada", async () => {
    expect(await rpc(db, null, "publico_orden", { p_token: crypto.randomUUID() })).toEqual({ existe: false });
  });

  it("30 días después de cerrada, el enlace ya no muestra la orden", async () => {
    const e = await escenario();
    const r = await recibir(e.userId, {});
    await estado(e.userId, r.id, "entregado");
    const consultar = async (dias: number) =>
      (
        await db.query<{ d: { existe: boolean } }>(
          `select public.fn_publico_orden($1, now() + make_interval(days => $2)) as d`,
          [r.token, dias]
        )
      ).rows[0].d.existe;
    expect(await consultar(29)).toBe(true);
    expect(await consultar(31)).toBe(false);
  });
});
