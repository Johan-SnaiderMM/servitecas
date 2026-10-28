/**
 * Mensajes desde el enlace (migración 0009, SPEC F6): el cliente escribe con su token (límite por hora, solo con la
 * orden abierta), el taller responde y marca como visto, nada sale de otro taller y el aviso push se toma una vez.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIMITE_MENSAJES_HORA } from "@/lib/mensajes";
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
/** Un taller con jefe de patio, recepción, alguien que solo maneja el catálogo y una orden abierta de Juan Pérez. */
async function escenario(): Promise<Escenario> {
  contador += 1;
  const t = await crearTaller(db, `Serviteca M${contador}`);
  const jefe = await crearMiembro(db, t.tallerId, "Camilo Ruiz", ["Jefe de patio"]);
  const recepcion = await crearMiembro(db, t.tallerId, "Daniela", ["Recepción"]);
  await crearRol(db, t.tallerId, "Catálogo", ["catalogo"]);
  const catalogo = await crearMiembro(db, t.tallerId, "Ana", ["Catálogo"]);
  const orden = await rpc<{ id: string; token: string }>(db, recepcion, "recibir_vehiculo", {
    p_clave: crypto.randomUUID(),
    p_placa: "ABC123",
    p_celular: "3001234567",
    p_nombre: "Juan Pérez",
    p_servicio: "Alineación",
  });
  return { ...t, jefe, recepcion, catalogo, orden };
}

type Envio = { ok: boolean; id?: string; repetido?: boolean; motivo?: string };
const escribir = (token: string, texto: string, clave: string = crypto.randomUUID()) =>
  rpc<Envio>(db, null, "publico_enviar_mensaje", { p_token: token, p_clave: clave, p_texto: texto });

/** El mismo envío con un instante fijo (para el límite por hora). */
async function escribirEn(token: string, texto: string, ahora: string): Promise<Envio> {
  const { rows } = await db.query<{ r: Envio }>(`select public.fn_publico_enviar_mensaje($1, $2, $3, $4) as r`, [
    token,
    crypto.randomUUID(),
    texto,
    ahora,
  ]);
  return rows[0].r;
}

const responder = (actor: string, orden: string, texto: string, clave: string = crypto.randomUUID()) =>
  rpc<{ id: string; repetido: boolean }>(db, actor, "enviar_mensaje_orden", { p_clave: clave, p_orden: orden, p_texto: texto });

type MensajeOrden = { id: string; de: string; texto: string; autor: string | null; leido: boolean };
const mensajesDe = async (actor: string, orden: string) =>
  (await rpc<{ mensajes: MensajeOrden[] }>(db, actor, "obtener_orden", { p_id: orden })).mensajes;

type MensajePublico = { id: string; de: string; texto: string; autor: string | null; visto: boolean | null };
const mensajesPublicos = async (token: string) =>
  (await rpc<{ orden: { mensajes: MensajePublico[] } }>(db, null, "publico_orden", { p_token: token })).orden.mensajes;

const sinLeer = async (actor: string, orden: string) =>
  (await rpc<{ abiertas: { id: string; mensajes_sin_leer: number }[] }>(db, actor, "listar_ordenes")).abiertas.find(
    (o) => o.id === orden
  )?.mensajes_sin_leer;

describe("el cliente escribe desde su enlace", () => {
  it("el límite por hora de SQL y el de TypeScript son el mismo", async () => {
    const { rows } = await db.query<{ n: number }>(`select public.fn_limite_mensajes_hora() as n`);
    expect(rows[0].n).toBe(LIMITE_MENSAJES_HORA);
  });

  it("el mensaje llega a la orden con su primer nombre, sin cuenta, y conserva los renglones", async () => {
    const e = await escenario();
    const r = await escribir(e.orden.token, "  ¿Ya   está listo?\r\n\n\n\n¿A qué hora   paso?  ");
    expect(r).toMatchObject({ ok: true, repetido: false });

    const lista = await mensajesDe(e.jefe, e.orden.id);
    expect(lista).toEqual([
      expect.objectContaining({ id: r.id, de: "cliente", texto: "¿Ya está listo?\n\n¿A qué hora paso?", autor: "Juan", leido: false }),
    ]);
    const { rows } = await db.query<{ registrado_por: string | null }>(
      `select registrado_por from public.mensajes_orden where id = $1`,
      [r.id]
    );
    expect(rows[0].registrado_por).toBeNull();
    expect(await sinLeer(e.recepcion, e.orden.id)).toBe(1);
  });

  it("un reintento con la misma clave no lo duplica; una clave de otra orden no sirve", async () => {
    const a = await escenario();
    const b = await escenario();
    const clave = crypto.randomUUID();
    expect(await escribir(a.orden.token, "Hola", clave)).toMatchObject({ ok: true, repetido: false });
    expect(await escribir(a.orden.token, "Hola", clave)).toEqual({ ok: true, id: clave, repetido: true });
    expect(await escribir(b.orden.token, "Hola", clave)).toEqual({ ok: false, motivo: "no_existe" });
    expect(await mensajesDe(a.jefe, a.orden.id)).toHaveLength(1);
    expect(await mensajesDe(b.jefe, b.orden.id)).toHaveLength(0);
  });

  it("vacío, muy largo o con un token que no existe no se guarda", async () => {
    const e = await escenario();
    expect(await escribir(e.orden.token, "   \n  ")).toEqual({ ok: false, motivo: "vacio" });
    expect(await escribir(e.orden.token, "a".repeat(501))).toEqual({ ok: false, motivo: "largo" });
    expect(await escribir(e.orden.token, "a".repeat(500))).toMatchObject({ ok: true });
    expect(await escribir(crypto.randomUUID(), "Hola")).toEqual({ ok: false, motivo: "no_existe" });
  });

  it(`máximo ${LIMITE_MENSAJES_HORA} por hora; al pasar la hora vuelve a poder`, async () => {
    const e = await escenario();
    const t0 = Date.parse("2026-10-21T15:00:00Z");
    const en = (min: number) => new Date(t0 + min * 60_000).toISOString();
    for (let i = 0; i < LIMITE_MENSAJES_HORA; i++) {
      expect(await escribirEn(e.orden.token, `Mensaje ${i}`, en(i))).toMatchObject({ ok: true });
    }
    expect(await escribirEn(e.orden.token, "Uno más", en(30))).toEqual({ ok: false, motivo: "limite" });
    // Los del taller no cuentan para el límite del cliente.
    await responder(e.jefe, e.orden.id, "Ya te contamos");
    expect(await escribirEn(e.orden.token, "Uno más", en(59))).toEqual({ ok: false, motivo: "limite" });
    expect(await escribirEn(e.orden.token, "Ahora sí", en(61))).toMatchObject({ ok: true });
  });

  it("con la orden cerrada ya no se escribe (ni el cliente ni el taller)", async () => {
    const e = await escenario();
    await rpc(db, e.recepcion, "cancelar_orden", { p_id: e.orden.id, p_motivo: "El cliente no volvió" });
    expect(await escribir(e.orden.token, "Hola")).toEqual({ ok: false, motivo: "cerrada" });
    await expect(responder(e.jefe, e.orden.id, "Hola")).rejects.toMatchObject({ message: expect.stringContaining("cerrada") });
  });
});

describe("el taller responde", () => {
  it("recepción o el patio responden con su nombre; responder marca como visto lo del cliente", async () => {
    const e = await escenario();
    await escribir(e.orden.token, "¿Cuánto vale la alineación?");
    await escribir(e.orden.token, "¿Y el balanceo?");
    expect(await sinLeer(e.jefe, e.orden.id)).toBe(2);

    const r = await responder(e.jefe, e.orden.id, "  La alineación vale  $ 60.000 ");
    expect(r.repetido).toBe(false);
    expect(await sinLeer(e.jefe, e.orden.id)).toBe(0);

    const lista = await mensajesDe(e.recepcion, e.orden.id);
    expect(lista.map((m) => [m.de, m.autor, m.leido])).toEqual([
      ["cliente", "Juan", true],
      ["cliente", "Juan", true],
      ["taller", "Camilo Ruiz", false],
    ]);
    expect(lista[2].texto).toBe("La alineación vale $ 60.000");
    expect(await responder(e.jefe, e.orden.id, "Otra cosa", r.id)).toEqual({ id: r.id, repetido: true });
  });

  it("abrir la orden marca como visto, y el cliente lo ve en su enlace con el primer nombre de quien respondió", async () => {
    const e = await escenario();
    await escribir(e.orden.token, "Hola");
    expect((await mensajesPublicos(e.orden.token))[0]).toMatchObject({ de: "cliente", visto: false, autor: null });

    expect(await rpc(db, e.recepcion, "marcar_mensajes_leidos", { p_orden: e.orden.id })).toEqual({ marcados: 1 });
    expect(await rpc(db, e.recepcion, "marcar_mensajes_leidos", { p_orden: e.orden.id })).toEqual({ marcados: 0 });
    await responder(e.jefe, e.orden.id, "Hola Juan, ya casi");

    const publicos = await mensajesPublicos(e.orden.token);
    expect(publicos.map((m) => [m.de, m.autor, m.visto])).toEqual([
      ["cliente", null, true],
      ["taller", "Camilo", null],
    ]);
    expect(JSON.stringify(publicos)).not.toContain("Ruiz");
  });

  it("vacío o muy largo no se manda", async () => {
    const e = await escenario();
    await expect(responder(e.jefe, e.orden.id, "  ")).rejects.toMatchObject({ message: expect.stringContaining("Escribe el mensaje") });
    await expect(responder(e.jefe, e.orden.id, "b".repeat(501))).rejects.toMatchObject({ message: expect.stringContaining("muy largo") });
  });

  it("solo quien trabaja vehículos, y solo en su taller", async () => {
    const a = await escenario();
    const b = await escenario();
    await escribir(a.orden.token, "Hola");
    await expect(responder(a.catalogo, a.orden.id, "Hola")).rejects.toMatchObject({ code: "42501" });
    await expect(rpc(db, a.catalogo, "marcar_mensajes_leidos", { p_orden: a.orden.id })).rejects.toMatchObject({ code: "42501" });
    await expect(responder(b.jefe, a.orden.id, "Hola")).rejects.toMatchObject({ code: "P0002" });
    expect(await rpc(db, b.jefe, "marcar_mensajes_leidos", { p_orden: a.orden.id })).toEqual({ marcados: 0 });
    expect(await sinLeer(a.jefe, a.orden.id)).toBe(1);
  });

  it("la tabla: cada taller ve solo lo suyo, anon nada, y nada se borra", async () => {
    const a = await escenario();
    const b = await escenario();
    const r = await escribir(a.orden.token, "Hola");
    expect(await como(db, a.jefe, `select id from public.mensajes_orden`)).toEqual([{ id: r.id }]);
    expect(await como(db, b.jefe, `select id from public.mensajes_orden`)).toEqual([]);
    expect(await como(db, a.catalogo, `select id from public.mensajes_orden`)).toEqual([]);
    await expect(como(db, null, `select id from public.mensajes_orden`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query(`delete from public.mensajes_orden where id = $1`, [r.id])).rejects.toMatchObject({ code: "42501" });
  });
});

describe("aviso push del mensaje", () => {
  const suscribir = (actor: string) =>
    rpc(db, actor, "guardar_suscripcion_push", {
      p_endpoint: `https://push.ejemplo.test/${crypto.randomUUID()}`,
      p_p256dh: "p".repeat(40),
      p_auth: "a".repeat(16),
    });

  type Aviso = { ok: boolean; aviso?: { texto: string; cliente: string; placa: string; numero: number }; suscripciones?: unknown[] };
  const tomar = (token: string, mensaje: string) =>
    rpc<Aviso>(db, null, "publico_tomar_aviso_mensaje", { p_token: token, p_mensaje: mensaje });

  it("se toma UNA vez, con las suscripciones de quien atiende el vehículo", async () => {
    const e = await escenario();
    await rpc(db, e.recepcion, "asignar_orden", { p_id: e.orden.id, p_user: e.jefe });
    await suscribir(e.jefe);
    await suscribir(e.recepcion);
    const m = await escribir(e.orden.token, "¿Ya está?");

    const r = await tomar(e.orden.token, m.id!);
    expect(r).toMatchObject({ ok: true, aviso: { texto: "¿Ya está?", cliente: "Juan", placa: "ABC123" } });
    expect(r.suscripciones).toHaveLength(1);
    expect(await tomar(e.orden.token, m.id!)).toEqual({ ok: false });
  });

  it("sin nadie asignado le llega a todo el patio, no a recepción", async () => {
    const e = await escenario();
    await suscribir(e.jefe);
    await suscribir(e.recepcion);
    const m = await escribir(e.orden.token, "Hola");
    expect((await tomar(e.orden.token, m.id!)).suscripciones).toHaveLength(1);
  });

  it("no con otro token, ni para un mensaje del taller, ni pasados 10 minutos", async () => {
    const a = await escenario();
    const b = await escenario();
    const m = await escribir(a.orden.token, "Hola");
    expect(await tomar(b.orden.token, m.id!)).toEqual({ ok: false });

    const t = await responder(a.jefe, a.orden.id, "Hola Juan");
    expect(await tomar(a.orden.token, t.id)).toEqual({ ok: false });

    const viejo = await escribirEn(a.orden.token, "De hace rato", new Date(Date.now() - 11 * 60_000).toISOString());
    expect(await tomar(a.orden.token, viejo.id!)).toEqual({ ok: false });
  });
});
