/**
 * Taller de demo (migración 0011, SPEC F8): datos ficticios relativos a hoy, deterministas, que se reinician con PIN
 * solo en una demo y solo por su gerente. El jefe de patio de la demo sobrevive al reinicio; los invitados no.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { como, crearBase, crearMiembro, crearTaller, crearUsuario, rpc } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

let contador = 0;
/** Una demo nueva con su gerente y su jefe de patio, cargada en el instante `ahora`. */
async function demo(ahora = "2026-10-21T15:00:00Z") {
  contador += 1;
  const gerente = await crearUsuario(db, `demo${contador}@ejemplo.test`);
  const jefe = await crearUsuario(db, `jefe-demo${contador}@ejemplo.test`);
  const { rows } = await db.query<{ r: { taller_id: string } }>(
    `select public.fn_provisionar_demo($1, $2, 'Llantas y Servicios Demo', $3) as r`,
    [`demo${contador}@ejemplo.test`, `jefe-demo${contador}@ejemplo.test`, ahora]
  );
  return { taller: rows[0].r.taller_id, gerente, jefe };
}

/** Todo el contenido de la demo sin ids ni enlaces: lo que tiene que salir igual en cada carga. */
async function contenido(taller: string) {
  const { rows } = await db.query<{ c: unknown }>(
    `select jsonb_build_object(
       'ordenes', (select jsonb_agg(jsonb_build_object(
           'n', o.numero, 'placa', v.placa, 'cliente', c.nombre, 'celular', c.celular, 'servicio', o.servicio,
           'km', o.kilometraje, 'estado', o.estado, 'desde', o.estado_desde, 'creada', o.created_at,
           'entregado', o.entregado_at, 'cancelada', o.cancelada_at, 'asignado', public.fn_nombre_de(o.asignado_a),
           'eventos', (select jsonb_agg(jsonb_build_object('t', e.tipo, 'e', e.estado, 'd', e.detalle, 'a', e.autor, 'at', e.created_at)
                                        order by e.created_at, e.tipo) from public.orden_eventos e where e.orden_id = o.id),
           'hallazgos', (select jsonb_agg(jsonb_build_object('t', h.titulo, 'p', h.precio, 'e', h.estado, 'c', h.canal,
                                                             'r', h.respondido_at, 'q', h.autor_respuesta, 'at', h.created_at)
                                          order by h.created_at, h.titulo) from public.hallazgos h where h.orden_id = o.id),
           'mensajes', (select jsonb_agg(jsonb_build_object('de', m.de, 'x', m.texto, 'a', m.autor, 'at', m.created_at,
                                                            'l', m.leido_at) order by m.created_at)
                          from public.mensajes_orden m where m.orden_id = o.id)
         ) order by o.numero)
         from public.ordenes o
         join public.vehiculos v on v.id = o.vehiculo_id
         join public.clientes c on c.id = o.cliente_id
        where o.taller_id = $1),
       'catalogo', (select jsonb_agg(jsonb_build_object('n', k.nombre, 'p', k.precio_sugerido) order by k.categoria, k.orden)
                      from public.catalogo_hallazgos k where k.taller_id = $1),
       'equipo', (select jsonb_agg(jsonb_build_object('n', p.nombre, 'r', p.rol) order by p.rol, p.nombre)
                    from public.perfiles p where p.taller_id = $1)) as c`,
    [taller]
  );
  return rows[0].c;
}

type Patio = { abiertas: { mia: boolean; asignado: { nombre: string } | null; hallazgos_pendientes: number; mensajes_sin_leer: number }[] };

describe("datos de ejemplo", () => {
  it("dos cargas en el mismo instante dejan exactamente lo mismo", async () => {
    const d = await demo();
    const antes = await contenido(d.taller);
    await db.query(`select public.fn_cargar_datos_demo($1, '2026-10-21T15:00:00Z')`, [d.taller]);
    expect(await contenido(d.taller)).toEqual(antes);
  });

  it("el patio de hoy: seis vehículos, cuatro del jefe, autorizaciones esperando y un mensaje sin leer", async () => {
    const d = await demo(new Date().toISOString());
    const patio = await rpc<Patio>(db, d.jefe, "listar_ordenes");
    expect(patio.abiertas).toHaveLength(6);
    expect(patio.abiertas.filter((o) => o.mia)).toHaveLength(4);
    expect(patio.abiertas.filter((o) => o.asignado === null)).toHaveLength(1);
    expect(patio.abiertas.reduce((s, o) => s + o.hallazgos_pendientes, 0)).toBe(2);
    expect(patio.abiertas.reduce((s, o) => s + o.mensajes_sin_leer, 0)).toBe(1);
  });

  it("dos semanas de historia para el resumen, numeradas por orden de llegada", async () => {
    const d = await demo();
    const r = await rpc<{
      hallazgos: { autorizados: { n: number; valor: number }; rechazados: { n: number }; desde_enlace: number };
      ordenes: { entregadas: number; canceladas: number };
      tiempos: { minutos: number | null }[];
    }>(db, d.gerente, "obtener_resumen", { p_desde: "2026-10-08", p_hasta: "2026-10-21" });
    expect(r.ordenes.entregadas).toBeGreaterThan(20);
    expect(r.ordenes.canceladas).toBe(1);
    expect(r.hallazgos.autorizados.n).toBeGreaterThan(r.hallazgos.rechazados.n);
    expect(r.hallazgos.autorizados.valor).toBeGreaterThan(1_000_000);
    expect(r.hallazgos.desde_enlace).toBeGreaterThan(0);
    expect(r.tiempos.every((t) => t.minutos !== null)).toBe(true);

    const { rows } = await db.query<{ numero: number }>(
      `select numero from public.ordenes where taller_id = $1 order by created_at`,
      [d.taller]
    );
    expect(rows.map((x) => x.numero)).toEqual(rows.map((_, i) => i + 1));
  });

  it("todo es inventado: celulares +57 300 000 20xx y el taller con datos de ejemplo", async () => {
    const d = await demo();
    const { rows } = await db.query<{ celular: string }>(`select celular from public.clientes where taller_id = $1`, [d.taller]);
    expect(rows.length).toBe(24);
    expect(rows.every((c) => /^\+573000002\d{3}$/.test(c.celular))).toBe(true);
    const ctx = await rpc<{ taller: { es_demo: boolean; whatsapp: string; reinicio_con_pin: boolean }; perfil: { nombre: string } }>(
      db,
      d.gerente,
      "obtener_contexto"
    );
    expect(ctx.taller).toMatchObject({ es_demo: true, whatsapp: "+573000002000", reinicio_con_pin: false });
    expect(ctx.perfil.nombre).toBe("Mónica Vélez");
    const jefe = await rpc<{ perfil: { nombre: string; roles: string[] } }>(db, d.jefe, "obtener_contexto");
    expect(jefe.perfil).toMatchObject({ nombre: "Andrés Mejía", roles: ["Jefe de patio"] });
  });

  it("el enlace del cliente de una orden de hoy funciona y pide su autorización", async () => {
    const d = await demo(new Date().toISOString());
    const { rows } = await db.query<{ token: string }>(
      `select o.token from public.ordenes o join public.hallazgos h on h.orden_id = o.id
        where o.taller_id = $1 and h.estado = 'pendiente' limit 1`,
      [d.taller]
    );
    const p = await rpc<{ existe: boolean; orden: { hallazgos: { estado: string }[] } }>(db, null, "publico_orden", {
      p_token: rows[0].token,
    });
    expect(p.existe).toBe(true);
    expect(p.orden.hallazgos.some((h) => h.estado === "pendiente")).toBe(true);
  });
});

describe("reiniciar", () => {
  it("borra lo que se hizo en la visita; el gerente y el jefe se quedan, los invitados se van", async () => {
    const d = await demo(new Date().toISOString());
    const invitado = await crearMiembro(db, d.taller, "Visitante", ["Recepción"]);
    const nueva = await rpc<{ id: string }>(db, d.jefe, "recibir_vehiculo", {
      p_clave: crypto.randomUUID(),
      p_placa: "ZZZ999",
      p_celular: "3009998877",
      p_nombre: "Prueba en vivo",
      p_servicio: "Despinche",
    });

    expect(await rpc(db, d.gerente, "reiniciar_demo", { p_pin: null })).toEqual({ ok: true });

    const { rows } = await db.query(`select 1 from public.ordenes where id = $1`, [nueva.id]);
    expect(rows).toEqual([]);
    expect(await como(db, invitado, `select public.mi_taller() as t`)).toEqual([{ t: null }]);
    const jefe = await rpc<{ perfil: { roles: string[] } }>(db, d.jefe, "obtener_contexto");
    expect(jefe.perfil.roles).toEqual(["Jefe de patio"]);
    expect((await rpc<Patio>(db, d.jefe, "listar_ordenes")).abiertas).toHaveLength(6);
  });

  it("solo el gerente, y solo en una demo", async () => {
    const d = await demo();
    await expect(rpc(db, d.jefe, "reiniciar_demo", { p_pin: null })).rejects.toMatchObject({ code: "42501" });
    const real = await crearTaller(db, "Serviteca de verdad");
    await expect(rpc(db, real.userId, "reiniciar_demo", { p_pin: null })).rejects.toMatchObject({ code: "42501" });
    await expect(db.query(`select public.fn_cargar_datos_demo($1)`, [real.tallerId])).rejects.toMatchObject({ code: "42501" });
  });

  it("con PIN: el equivocado cuenta intentos y a los 5 se bloquea", async () => {
    const d = await demo();
    const { rows } = await db.query<{ n: number }>(`select public.fn_definir_pin_reinicio('4821', $1) as n`, [d.taller]);
    expect(rows[0].n).toBe(1);
    const ctx = await rpc<{ taller: { reinicio_con_pin: boolean } }>(db, d.gerente, "obtener_contexto");
    expect(ctx.taller.reinicio_con_pin).toBe(true);

    expect(await rpc(db, d.gerente, "reiniciar_demo", { p_pin: "0000" })).toEqual({ ok: false, motivo: "pin", intentos_restantes: 4 });
    expect(await rpc(db, d.gerente, "reiniciar_demo", { p_pin: "4821" })).toEqual({ ok: true });
    for (let i = 0; i < 4; i++) await rpc(db, d.gerente, "reiniciar_demo", { p_pin: "1111" });
    expect(await rpc(db, d.gerente, "reiniciar_demo", { p_pin: "1111" })).toEqual({ ok: false, motivo: "bloqueado", minutos: 5 });
    expect(await rpc(db, d.gerente, "reiniciar_demo", { p_pin: "4821" })).toMatchObject({ ok: false, motivo: "bloqueado" });

    await expect(db.query(`select public.fn_definir_pin_reinicio('12', $1)`, [d.taller])).rejects.toMatchObject({
      message: expect.stringContaining("entre 4 y 8 dígitos"),
    });
    await db.query(`select public.fn_definir_pin_reinicio(null, $1)`, [d.taller]);
    expect(await rpc(db, d.gerente, "reiniciar_demo", { p_pin: null })).toEqual({ ok: true });
  });

  it("nadie lee los PIN, ni el gerente", async () => {
    const d = await demo();
    await db.query(`select public.fn_definir_pin_reinicio('4821', $1)`, [d.taller]);
    await expect(como(db, d.gerente, `select * from public.pines_reinicio`)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("dar de alta la demo", () => {
  it("no convierte en demo un taller de verdad ni usa la misma cuenta para gerente y jefe", async () => {
    const real = await crearTaller(db, "Otra de verdad");
    await expect(db.query(`select public.fn_provisionar_demo($1)`, [real.correo])).rejects.toMatchObject({
      message: expect.stringContaining("taller de verdad"),
    });
    await crearUsuario(db, "solo@ejemplo.test");
    await expect(db.query(`select public.fn_provisionar_demo('solo@ejemplo.test', 'solo@ejemplo.test')`)).rejects.toMatchObject({
      message: expect.stringContaining("su propio usuario"),
    });
  });

  it("se puede volver a correr: recarga los datos del mismo taller", async () => {
    const d = await demo();
    const { rows } = await db.query<{ r: { taller_id: string } }>(
      `select public.fn_provisionar_demo($1, $2) as r`,
      [`demo${contador}@ejemplo.test`, `jefe-demo${contador}@ejemplo.test`]
    );
    expect(rows[0].r.taller_id).toBe(d.taller);
  });
});
