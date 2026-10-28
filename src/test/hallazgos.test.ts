/**
 * Hallazgos y autorización (migración 0008, SPEC F4): catálogo por taller, crear un hallazgo, la respuesta única del
 * cliente desde su enlace (o por teléfono), anular, sus fotos y el aviso push que toma el servidor una sola vez.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATEGORIAS } from "@/lib/hallazgos";
import { como, crearBase, crearMiembro, crearRol, crearTaller, rpc, type TallerDePrueba } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

type Escenario = TallerDePrueba & {
  jefe: string;
  recepcion: string;
  catalogo: string;
  orden: { id: string; token: string };
};

let contador = 0;
/** Un taller con jefe de patio, recepción, alguien que maneja el catálogo y una orden abierta de Juan Pérez. */
async function escenario(): Promise<Escenario> {
  contador += 1;
  const t = await crearTaller(db, `Serviteca ${contador}`);
  const jefe = await crearMiembro(db, t.tallerId, "Camilo Ruiz", ["Jefe de patio"]);
  const recepcion = await crearMiembro(db, t.tallerId, "Daniela", ["Recepción"]);
  await crearRol(db, t.tallerId, "Catálogo", ["catalogo"]);
  const catalogo = await crearMiembro(db, t.tallerId, "Ana", ["Catálogo"]);
  const orden = await rpc<{ id: string; token: string }>(db, recepcion, "recibir_vehiculo", {
    p_clave: crypto.randomUUID(),
    p_placa: "ABC123",
    p_celular: "3001234567",
    p_nombre: "Juan Pérez",
    p_servicio: "Frenos",
  });
  return { ...t, jefe, recepcion, catalogo, orden };
}

type Item = { id: string; categoria: string; nombre: string; descripcion: string; precio_sugerido: number | null; activo: boolean };

const crear = (actor: string | null, orden: string, extra: Record<string, unknown> = {}) =>
  rpc<{ id: string; repetido: boolean }>(db, actor, "crear_hallazgo", {
    p_clave: crypto.randomUUID(),
    p_orden: orden,
    p_titulo: "Pastillas de freno delanteras gastadas",
    p_descripcion: "Las pastillas están por debajo del mínimo.",
    p_precio: 180000,
    ...extra,
  });

const responder = (token: string, hallazgo: string, respuesta: string) =>
  rpc<{ ok: boolean; motivo?: string; estado?: string }>(db, null, "publico_responder_hallazgo", {
    p_token: token,
    p_hallazgo: hallazgo,
    p_respuesta: respuesta,
  });

type Hallazgo = {
  id: string;
  titulo: string;
  precio: number | null;
  estado: string;
  canal: string | null;
  autor_respuesta: string | null;
  autor: string | null;
  fotos: string[];
};

const hallazgosDe = async (actor: string, orden: string) =>
  (await rpc<{ hallazgos: Hallazgo[]; eventos: { tipo: string; detalle: string | null; autor: string | null }[] }>(
    db,
    actor,
    "obtener_orden",
    { p_id: orden }
  ));

describe("catálogo", () => {
  it("las categorías de SQL y de TypeScript son idénticas", async () => {
    const { rows } = await db.query<{ c: string[] }>(`select public.fn_categorias_hallazgo() as c`);
    expect(rows[0].c).toEqual([...CATEGORIAS]);
  });

  it("cada taller nace con su lista, ordenada por categoría, y la ve quien trabaja vehículos", async () => {
    const e = await escenario();
    const lista = await rpc<Item[]>(db, e.jefe, "listar_catalogo");
    expect(lista.length).toBeGreaterThanOrEqual(30);
    expect(lista[0].categoria).toBe("llantas");
    expect(lista.find((i) => i.nombre === "Pastillas de freno delanteras gastadas")).toMatchObject({ categoria: "frenos" });
    const indices = lista.map((i) => CATEGORIAS.indexOf(i.categoria as (typeof CATEGORIAS)[number]));
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it("quien abre el catálogo crea, edita, archiva y restaura; nombres repetidos no", async () => {
    const e = await escenario();
    const { id } = await rpc<{ id: string }>(db, e.catalogo, "guardar_hallazgo_catalogo", {
      p_id: null,
      p_categoria: "otros",
      p_nombre: "  Exosto   roto ",
      p_descripcion: "El exosto tiene un hueco: suena duro y bota gases.",
      p_precio: 90000,
    });
    let lista = await rpc<Item[]>(db, e.catalogo, "listar_catalogo");
    expect(lista.find((i) => i.id === id)).toMatchObject({ nombre: "Exosto roto", precio_sugerido: 90000 });

    await rpc(db, e.catalogo, "guardar_hallazgo_catalogo", {
      p_id: id,
      p_categoria: "motor",
      p_nombre: "Exosto roto",
      p_descripcion: "Nueva explicación.",
      p_precio: null,
    });
    await expect(
      rpc(db, e.catalogo, "guardar_hallazgo_catalogo", {
        p_id: null,
        p_categoria: "frenos",
        p_nombre: "exosto ROTO",
        p_descripcion: "Repetido",
      })
    ).rejects.toMatchObject({ code: "P0001", message: expect.stringContaining("Ya hay un hallazgo con ese nombre") });

    await rpc(db, e.catalogo, "fijar_hallazgo_catalogo_activo", { p_id: id, p_activo: false });
    lista = await rpc<Item[]>(db, e.catalogo, "listar_catalogo");
    expect(lista.find((i) => i.id === id)).toBeUndefined();
    const todos = await rpc<Item[]>(db, e.catalogo, "listar_catalogo", { p_todos: true });
    expect(todos.find((i) => i.id === id)).toMatchObject({ activo: false, categoria: "motor", precio_sugerido: null });
    await rpc(db, e.catalogo, "fijar_hallazgo_catalogo_activo", { p_id: id, p_activo: true });
  });

  it("el jefe de patio y recepción no editan el catálogo; otro taller no lo ve", async () => {
    const a = await escenario();
    const b = await escenario();
    const args = { p_id: null, p_categoria: "otros", p_nombre: "X", p_descripcion: "Y" };
    await expect(rpc(db, a.jefe, "guardar_hallazgo_catalogo", args)).rejects.toMatchObject({ code: "42501" });
    await expect(rpc(db, a.recepcion, "guardar_hallazgo_catalogo", args)).rejects.toMatchObject({ code: "42501" });
    const deA = await rpc<Item[]>(db, a.jefe, "listar_catalogo");
    await expect(
      rpc(db, b.userId, "fijar_hallazgo_catalogo_activo", { p_id: deA[0].id, p_activo: false })
    ).rejects.toMatchObject({ code: "P0002" });
    expect(await como(db, b.jefe, `select 1 from public.catalogo_hallazgos where taller_id = $1`, [a.tallerId])).toEqual([]);
  });
});

describe("crear_hallazgo", () => {
  it("lo crea pendiente, con su autor, y queda en la historia", async () => {
    const e = await escenario();
    const item = (await rpc<Item[]>(db, e.jefe, "listar_catalogo")).find((i) => i.categoria === "frenos")!;
    const h = await crear(e.jefe, e.orden.id, { p_catalogo: item.id, p_titulo: item.nombre, p_descripcion: item.descripcion });
    const o = await hallazgosDe(e.jefe, e.orden.id);
    expect(o.hallazgos).toEqual([
      expect.objectContaining({ id: h.id, titulo: item.nombre, precio: 180000, estado: "pendiente", autor: "Camilo Ruiz", fotos: [] }),
    ]);
    expect(o.eventos.at(-1)).toMatchObject({ tipo: "hallazgo", detalle: item.nombre, autor: "Camilo Ruiz" });
  });

  it("un reintento con la misma clave no lo duplica; precio opcional", async () => {
    const e = await escenario();
    const clave = crypto.randomUUID();
    await crear(e.jefe, e.orden.id, { p_clave: clave, p_precio: null });
    expect(await crear(e.jefe, e.orden.id, { p_clave: clave })).toEqual({ id: clave, repetido: true });
    const o = await hallazgosDe(e.jefe, e.orden.id);
    expect(o.hallazgos).toHaveLength(1);
    expect(o.hallazgos[0].precio).toBeNull();
  });

  it.each([
    ["sin título", { p_titulo: "  " }, "qué se encontró"],
    ["sin explicación", { p_descripcion: "" }, "Explícale al cliente"],
    ["con precio negativo", { p_precio: -1 }, "precio no es válido"],
  ])("rechaza un hallazgo %s", async (_caso, extra, mensaje) => {
    const e = await escenario();
    await expect(crear(e.jefe, e.orden.id, extra)).rejects.toMatchObject({ code: "P0001", message: expect.stringContaining(mensaje) });
  });

  it("solo quien trabaja el patio, en órdenes abiertas de su taller y con la lista de su taller", async () => {
    const a = await escenario();
    const b = await escenario();
    await expect(crear(a.recepcion, a.orden.id)).rejects.toMatchObject({ code: "42501" });
    await expect(crear(null, a.orden.id)).rejects.toMatchObject({ code: "42501" });
    await expect(crear(b.jefe, a.orden.id)).rejects.toMatchObject({ code: "P0002" });
    const deB = (await rpc<Item[]>(db, b.jefe, "listar_catalogo"))[0];
    await expect(crear(a.jefe, a.orden.id, { p_catalogo: deB.id })).rejects.toMatchObject({ code: "P0002" });
    await rpc(db, a.userId, "cambiar_estado_orden", { p_id: a.orden.id, p_estado: "entregado" });
    await expect(crear(a.jefe, a.orden.id)).rejects.toMatchObject({ message: expect.stringContaining("ya está cerrada") });
  });
});

describe("respuesta del cliente desde su enlace", () => {
  it("autoriza una sola vez: queda con canal, hora y el primer nombre del cliente", async () => {
    const e = await escenario();
    const h = await crear(e.jefe, e.orden.id);
    expect(await responder(e.orden.token, h.id, "autorizado")).toEqual({ ok: true, estado: "autorizado" });
    expect(await responder(e.orden.token, h.id, "rechazado")).toEqual({ ok: false, motivo: "ya_respondido", estado: "autorizado" });

    const o = await hallazgosDe(e.jefe, e.orden.id);
    expect(o.hallazgos[0]).toMatchObject({ estado: "autorizado", canal: "enlace", autor_respuesta: "Juan" });
    expect(o.eventos.at(-1)).toMatchObject({ tipo: "respuesta", detalle: expect.stringContaining("Autorizó"), autor: "Juan" });
  });

  it("también puede decir que no; el taller ya no puede cambiar la respuesta", async () => {
    const e = await escenario();
    const h = await crear(e.jefe, e.orden.id);
    expect(await responder(e.orden.token, h.id, "rechazado")).toEqual({ ok: true, estado: "rechazado" });
    await expect(
      rpc(db, e.jefe, "responder_hallazgo_telefono", { p_id: h.id, p_respuesta: "autorizado" })
    ).rejects.toMatchObject({ message: expect.stringContaining("ya tiene respuesta") });
  });

  it("con otro token, otro hallazgo, una respuesta inventada o un hallazgo anulado no pasa nada", async () => {
    const a = await escenario();
    const b = await escenario();
    const ha = await crear(a.jefe, a.orden.id);
    expect(await responder(b.orden.token, ha.id, "autorizado")).toEqual({ ok: false, motivo: "no_existe" });
    expect(await responder(crypto.randomUUID(), ha.id, "autorizado")).toEqual({ ok: false, motivo: "no_existe" });
    expect(await responder(a.orden.token, ha.id, "tal vez")).toEqual({ ok: false, motivo: "no_existe" });
    await rpc(db, a.jefe, "anular_hallazgo", { p_id: ha.id, p_motivo: "Me equivoqué de carro" });
    expect(await responder(a.orden.token, ha.id, "autorizado")).toEqual({ ok: false, motivo: "no_existe" });
  });

  it("con la orden cerrada ya no se responde", async () => {
    const e = await escenario();
    const h = await crear(e.jefe, e.orden.id);
    await rpc(db, e.userId, "cambiar_estado_orden", { p_id: e.orden.id, p_estado: "entregado" });
    expect(await responder(e.orden.token, h.id, "autorizado")).toEqual({ ok: false, motivo: "cerrada" });
  });

  it("el enlace muestra los hallazgos vigentes con precio y fotos, sin quién los registró", async () => {
    const e = await escenario();
    const h1 = await crear(e.jefe, e.orden.id);
    const h2 = await crear(e.jefe, e.orden.id, { p_titulo: "Puesto por error" });
    await rpc(db, e.jefe, "anular_hallazgo", { p_id: h2.id, p_motivo: "Error" });
    const foto = crypto.randomUUID();
    await rpc(db, e.jefe, "registrar_foto_orden", { p_clave: foto, p_orden: e.orden.id, p_hallazgo: h1.id });

    const p = await rpc<{ orden: { hallazgos: { id: string; precio: number; estado: string; fotos: string[] }[]; fotos: unknown[] } }>(
      db,
      null,
      "publico_orden",
      { p_token: e.orden.token }
    );
    expect(p.orden.hallazgos).toEqual([expect.objectContaining({ id: h1.id, precio: 180000, estado: "pendiente", fotos: [foto] })]);
    expect(p.orden.fotos).toEqual([]); // la foto del hallazgo no es foto de ingreso
    expect(JSON.stringify(p)).not.toContain("Camilo");
  });
});

describe("respuesta por teléfono y anular", () => {
  it("recepción o el jefe anotan la respuesta con su nombre", async () => {
    const e = await escenario();
    const h = await crear(e.jefe, e.orden.id);
    await rpc(db, e.recepcion, "responder_hallazgo_telefono", { p_id: h.id, p_respuesta: "autorizado" });
    const o = await hallazgosDe(e.jefe, e.orden.id);
    expect(o.hallazgos[0]).toMatchObject({ estado: "autorizado", canal: "telefono", autor_respuesta: "Daniela" });
    await expect(
      rpc(db, e.recepcion, "responder_hallazgo_telefono", { p_id: h.id, p_respuesta: "quizás" })
    ).rejects.toMatchObject({ message: expect.stringContaining("Elige si el cliente autorizó") });
  });

  it("anular pide motivo, solo el patio, y no se anula dos veces", async () => {
    const e = await escenario();
    const h = await crear(e.jefe, e.orden.id);
    await expect(rpc(db, e.jefe, "anular_hallazgo", { p_id: h.id, p_motivo: "" })).rejects.toMatchObject({
      message: expect.stringContaining("por qué se anula"),
    });
    await expect(rpc(db, e.recepcion, "anular_hallazgo", { p_id: h.id, p_motivo: "No va" })).rejects.toMatchObject({
      code: "42501",
    });
    await rpc(db, e.jefe, "anular_hallazgo", { p_id: h.id, p_motivo: "No va" });
    await expect(rpc(db, e.jefe, "anular_hallazgo", { p_id: h.id, p_motivo: "Otra vez" })).rejects.toMatchObject({
      code: "P0002",
    });
    expect((await hallazgosDe(e.jefe, e.orden.id)).hallazgos[0].estado).toBe("anulado");
  });

  it("nada se borra", async () => {
    const e = await escenario();
    const h = await crear(e.jefe, e.orden.id);
    await expect(db.query(`delete from public.hallazgos where id = $1`, [h.id])).rejects.toMatchObject({ code: "42501" });
  });
});

describe("fotos de un hallazgo", () => {
  it("hasta 3 por hallazgo, del mismo vehículo, y no cuentan como fotos de ingreso", async () => {
    const a = await escenario();
    const b = await escenario();
    const h = await crear(a.jefe, a.orden.id);
    for (let i = 0; i < 3; i++) {
      await rpc(db, a.jefe, "registrar_foto_orden", { p_clave: crypto.randomUUID(), p_orden: a.orden.id, p_hallazgo: h.id });
    }
    await expect(
      rpc(db, a.jefe, "registrar_foto_orden", { p_clave: crypto.randomUUID(), p_orden: a.orden.id, p_hallazgo: h.id })
    ).rejects.toMatchObject({ message: expect.stringContaining("hasta 3 fotos") });
    await expect(
      rpc(db, b.jefe, "registrar_foto_orden", { p_clave: crypto.randomUUID(), p_orden: b.orden.id, p_hallazgo: h.id })
    ).rejects.toMatchObject({ code: "P0002" });

    const o = await rpc<{ fotos: unknown[]; hallazgos: { fotos: string[] }[] }>(db, a.jefe, "obtener_orden", { p_id: a.orden.id });
    expect(o.fotos).toEqual([]);
    expect(o.hallazgos[0].fotos).toHaveLength(3);
  });

  it("las fotos de un hallazgo anulado ya no se sirven al cliente", async () => {
    const e = await escenario();
    const h = await crear(e.jefe, e.orden.id);
    const foto = crypto.randomUUID();
    await rpc(db, e.jefe, "registrar_foto_orden", { p_clave: foto, p_orden: e.orden.id, p_hallazgo: h.id });
    const ruta = () => rpc<string | null>(db, null, "publico_ruta_foto", { p_token: e.orden.token, p_foto: foto });
    expect(await ruta()).not.toBeNull();
    await rpc(db, e.jefe, "anular_hallazgo", { p_id: h.id, p_motivo: "Error" });
    expect(await ruta()).toBeNull();
  });
});

describe("avisos push", () => {
  const suscribir = (actor: string, n: number) =>
    rpc(db, actor, "guardar_suscripcion_push", {
      p_endpoint: `https://push.ejemplo.test/${n}-${crypto.randomUUID()}`,
      p_p256dh: "p".repeat(40),
      p_auth: "a".repeat(16),
    });

  type Aviso = { ok: boolean; aviso?: { titulo: string; estado: string; placa: string; cliente: string }; suscripciones?: unknown[] };
  const tomar = (token: string, hallazgo: string) => rpc<Aviso>(db, null, "publico_tomar_aviso", { p_token: token, p_hallazgo: hallazgo });

  it("tras la respuesta del cliente se toma UNA vez, con las suscripciones de quien atiende el vehículo", async () => {
    const e = await escenario();
    await rpc(db, e.recepcion, "asignar_orden", { p_id: e.orden.id, p_user: e.jefe });
    await suscribir(e.jefe, 1);
    await suscribir(e.jefe, 2);
    await suscribir(e.recepcion, 3);
    const h = await crear(e.jefe, e.orden.id);

    expect(await tomar(e.orden.token, h.id)).toEqual({ ok: false }); // todavía no responde
    await responder(e.orden.token, h.id, "autorizado");
    const r = await tomar(e.orden.token, h.id);
    expect(r).toMatchObject({ ok: true, aviso: { estado: "autorizado", placa: "ABC123", cliente: "Juan" } });
    expect(r.suscripciones).toHaveLength(2);
    expect(await tomar(e.orden.token, h.id)).toEqual({ ok: false });
  });

  it("sin nadie asignado avisa a todo el que trabaja el patio (no a recepción)", async () => {
    const e = await escenario();
    await suscribir(e.jefe, 1);
    await suscribir(e.userId, 2);
    await suscribir(e.recepcion, 3);
    const h = await crear(e.jefe, e.orden.id);
    await responder(e.orden.token, h.id, "rechazado");
    expect((await tomar(e.orden.token, h.id)).suscripciones).toHaveLength(2);
  });

  it("una respuesta por teléfono no avisa, ni una de hace más de 10 minutos", async () => {
    const e = await escenario();
    await suscribir(e.jefe, 1);
    const h1 = await crear(e.jefe, e.orden.id);
    await rpc(db, e.recepcion, "responder_hallazgo_telefono", { p_id: h1.id, p_respuesta: "autorizado" });
    expect(await tomar(e.orden.token, h1.id)).toEqual({ ok: false });

    const h2 = await crear(e.jefe, e.orden.id);
    await db.query(
      `select public.fn_publico_responder_hallazgo($1, $2, 'autorizado', now() - interval '11 minutes')`,
      [e.orden.token, h2.id]
    );
    expect(await tomar(e.orden.token, h2.id)).toEqual({ ok: false });
  });

  it("las suscripciones no se leen directo, y cada quien quita solo la suya", async () => {
    const e = await escenario();
    await suscribir(e.jefe, 1);
    await expect(como(db, e.userId, `select * from public.suscripciones_push`)).rejects.toMatchObject({ code: "42501" });
    await expect(como(db, null, `select * from public.suscripciones_push`)).rejects.toMatchObject({ code: "42501" });
  });
});
