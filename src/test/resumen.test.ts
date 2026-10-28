/**
 * Resumen (migración 0010, SPEC F7): hallazgos y su valor, vehículos y tiempos por estado de un periodo de días de
 * Bogotá. Los instantes se fijan a mano (como dueño de la base) después de armar cada caso con la API.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase, crearMiembro, crearTaller, rpc, type TallerDePrueba } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

type Resumen = {
  desde: string;
  hasta: string;
  hallazgos: {
    enviados: { n: number; valor: number };
    autorizados: { n: number; valor: number };
    rechazados: { n: number; valor: number };
    pendientes: { n: number; valor: number };
    sin_precio: number;
    desde_enlace: number;
    minutos_respuesta: number | null;
  };
  top: { titulo: string; autorizados: number; valor: number }[];
  ordenes: { recibidas: number; entregadas: number; canceladas: number; minutos_entrega: number | null; mensajes_clientes: number };
  tiempos: { estado: string; minutos: number | null; ordenes: number }[];
};

let contador = 0;

async function recibir(t: TallerDePrueba, actor: string, placa: string) {
  return rpc<{ id: string; token: string }>(db, actor, "recibir_vehiculo", {
    p_clave: crypto.randomUUID(),
    p_placa: placa,
    p_celular: "3001234567",
    p_nombre: "Juan Pérez",
    p_servicio: "Frenos",
  });
}

async function hallazgo(actor: string, orden: string, titulo: string, precio: number | null) {
  const { id } = await rpc<{ id: string }>(db, actor, "crear_hallazgo", {
    p_clave: crypto.randomUUID(),
    p_orden: orden,
    p_titulo: titulo,
    p_descripcion: "Explicación para el cliente.",
    p_precio: precio,
  });
  return id;
}

const estado = (actor: string, orden: string, e: string) => rpc(db, actor, "cambiar_estado_orden", { p_id: orden, p_estado: e });

/** Fija cuándo entró la orden a cada estado (y su creación y entrega). Instantes en UTC. */
async function fijarEstados(orden: string, tiempos: Record<string, string>) {
  for (const [e, at] of Object.entries(tiempos)) {
    await db.query(`update public.orden_eventos set created_at = $1 where orden_id = $2 and estado = $3`, [at, orden, e]);
  }
  await db.query(
    `update public.ordenes set created_at = $1, estado_desde = $1,
            entregado_at = case when entregado_at is not null then $2::timestamptz end,
            cancelada_at = case when cancelada_at is not null then $3::timestamptz end
      where id = $4`,
    [tiempos.recibido, tiempos.entregado ?? null, tiempos.cancelada ?? null, orden]
  );
}

const fijarHallazgo = (id: string, creado: string, respondido: string | null = null) =>
  db.query(`update public.hallazgos set created_at = $1, respondido_at = coalesce($2::timestamptz, respondido_at) where id = $3`, [
    creado,
    respondido,
    id,
  ]);

const resumen = (actor: string, desde: string, hasta: string) =>
  rpc<Resumen>(db, actor, "obtener_resumen", { p_desde: desde, p_hasta: hasta });

/**
 * Un taller con:
 *  A (sáb 10 oct, 8:00 a. m. Bogotá): recibido 30 min, diagnóstico 60, en proceso 120, listo 30 y entregado (4 h).
 *    Hallazgos: pastillas autorizadas desde el enlace ($ 180.000, 12 min), amortiguadores no autorizados por teléfono
 *    ($ 90.000, 30 min), bombillo esperando sin precio y uno anulado (no cuenta).
 *  B (sáb 10 oct, 9:00 a. m.): recibido 10 min, diagnóstico 50 min, sigue en proceso.
 *  C (jue 1 oct): fuera del periodo, con un hallazgo autorizado que no debe contar.
 *  D (dom 11 oct, 11:30 p. m. Bogotá = lun 12 oct en UTC): cancelado; cuenta en el domingo.
 */
async function escenario() {
  contador += 1;
  const t = await crearTaller(db, `Serviteca R${contador}`);
  const jefe = await crearMiembro(db, t.tallerId, "Camilo", ["Jefe de patio"]);
  const a = await recibir(t, jefe, "AAA111");
  const b = await recibir(t, jefe, "BBB222");
  const c = await recibir(t, jefe, "CCC333");
  const d = await recibir(t, jefe, "DDD444");

  const h1 = await hallazgo(jefe, a.id, "Pastillas de freno delanteras gastadas", 180000);
  const h2 = await hallazgo(jefe, a.id, "Amortiguadores traseros con fuga", 90000);
  const h3 = await hallazgo(jefe, a.id, "Bombillos fundidos", null);
  const h4 = await hallazgo(jefe, a.id, "Error", 50000);
  const h5 = await hallazgo(jefe, c.id, "Pastillas de freno delanteras gastadas", 999);
  await rpc(db, null, "publico_responder_hallazgo", { p_token: a.token, p_hallazgo: h1, p_respuesta: "autorizado" });
  await rpc(db, jefe, "responder_hallazgo_telefono", { p_id: h2, p_respuesta: "rechazado" });
  await rpc(db, jefe, "anular_hallazgo", { p_id: h4, p_motivo: "Puesto por error" });
  await rpc(db, null, "publico_responder_hallazgo", { p_token: c.token, p_hallazgo: h5, p_respuesta: "autorizado" });
  await rpc(db, null, "publico_enviar_mensaje", { p_token: a.token, p_clave: crypto.randomUUID(), p_texto: "¿Ya?" });

  for (const e of ["diagnostico", "en_proceso", "listo", "entregado"]) await estado(jefe, a.id, e);
  for (const e of ["diagnostico", "en_proceso"]) await estado(jefe, b.id, e);
  await rpc(db, jefe, "cancelar_orden", { p_id: d.id, p_motivo: "No volvió" });

  await fijarEstados(a.id, {
    recibido: "2026-10-10T13:00:00Z",
    diagnostico: "2026-10-10T13:30:00Z",
    en_proceso: "2026-10-10T14:30:00Z",
    listo: "2026-10-10T16:30:00Z",
    entregado: "2026-10-10T17:00:00Z",
  });
  await fijarEstados(b.id, {
    recibido: "2026-10-10T14:00:00Z",
    diagnostico: "2026-10-10T14:10:00Z",
    en_proceso: "2026-10-10T15:00:00Z",
  });
  await fijarEstados(c.id, { recibido: "2026-10-01T13:00:00Z" });
  await fijarEstados(d.id, { recibido: "2026-10-12T04:00:00Z", cancelada: "2026-10-12T04:30:00Z" });

  await fijarHallazgo(h1, "2026-10-10T13:40:00Z", "2026-10-10T13:52:00Z");
  await fijarHallazgo(h2, "2026-10-10T13:45:00Z", "2026-10-10T14:15:00Z");
  await fijarHallazgo(h3, "2026-10-10T13:50:00Z");
  await fijarHallazgo(h4, "2026-10-10T13:50:00Z");
  await fijarHallazgo(h5, "2026-10-01T13:10:00Z", "2026-10-01T13:20:00Z");
  await db.query(`update public.mensajes_orden set created_at = '2026-10-10T15:00:00Z' where orden_id = $1`, [a.id]);

  return { ...t, jefe };
}

describe("resumen", () => {
  it("hallazgos del periodo: cuántos y cuánto, sin anulados ni los de otros días", async () => {
    const e = await escenario();
    const r = await resumen(e.userId, "2026-10-08", "2026-10-11");
    expect(r.desde).toBe("2026-10-08");
    expect(r.hallazgos).toEqual({
      enviados: { n: 3, valor: 270000 },
      autorizados: { n: 1, valor: 180000 },
      rechazados: { n: 1, valor: 90000 },
      pendientes: { n: 1, valor: 0 },
      sin_precio: 1,
      desde_enlace: 1,
      minutos_respuesta: 21,
    });
    expect(r.top).toEqual([{ titulo: "Pastillas de freno delanteras gastadas", autorizados: 1, valor: 180000 }]);
  });

  it("vehículos del periodo, con los días de Bogotá (las 11:30 p. m. del domingo es domingo)", async () => {
    const e = await escenario();
    const r = await resumen(e.userId, "2026-10-08", "2026-10-11");
    expect(r.ordenes).toEqual({ recibidas: 3, entregadas: 1, canceladas: 1, minutos_entrega: 240, mensajes_clientes: 1 });
    const lunes = await resumen(e.userId, "2026-10-12", "2026-10-12");
    expect(lunes.ordenes).toMatchObject({ recibidas: 0, canceladas: 0 });
  });

  it("tiempo promedio en cada estado, solo con tramos terminados", async () => {
    const e = await escenario();
    const r = await resumen(e.userId, "2026-10-10", "2026-10-10");
    expect(r.tiempos).toEqual([
      { estado: "recibido", minutos: 20, ordenes: 2 },
      { estado: "diagnostico", minutos: 55, ordenes: 2 },
      { estado: "en_proceso", minutos: 120, ordenes: 1 },
      { estado: "listo", minutos: 30, ordenes: 1 },
    ]);
  });

  it("un periodo sin nada da ceros y los cuatro estados sin tiempo", async () => {
    const e = await escenario();
    const r = await resumen(e.userId, "2026-09-01", "2026-09-07");
    expect(r.hallazgos.enviados).toEqual({ n: 0, valor: 0 });
    expect(r.hallazgos.minutos_respuesta).toBeNull();
    expect(r.top).toEqual([]);
    expect(r.ordenes).toEqual({ recibidas: 0, entregadas: 0, canceladas: 0, minutos_entrega: null, mensajes_clientes: 0 });
    expect(r.tiempos.map((t) => [t.estado, t.minutos, t.ordenes])).toEqual([
      ["recibido", null, 0],
      ["diagnostico", null, 0],
      ["en_proceso", null, 0],
      ["listo", null, 0],
    ]);
  });

  it("solo con el área resumen, y cada taller ve lo suyo", async () => {
    const e = await escenario();
    const otro = await crearTaller(db, "Otra serviteca");
    await expect(resumen(e.jefe, "2026-10-08", "2026-10-11")).rejects.toMatchObject({ code: "42501" });
    const r = await resumen(otro.userId, "2026-10-08", "2026-10-11");
    expect(r.hallazgos.enviados.n).toBe(0);
    expect(r.ordenes.recibidas).toBe(0);
  });

  it("el periodo tiene que tener sentido y ser de hasta un año", async () => {
    const e = await escenario();
    await expect(resumen(e.userId, "2026-10-11", "2026-10-08")).rejects.toMatchObject({
      message: expect.stringContaining("periodo válido"),
    });
    await expect(resumen(e.userId, "2025-01-01", "2026-10-11")).rejects.toMatchObject({
      message: expect.stringContaining("hasta un año"),
    });
  });
});
