/**
 * Migración 0001: fechas de Bogotá, bloqueo de borrado y la función de salud que usa la portada.
 * Instantes fijos, nunca el reloj (salvo publico_salud, que solo se compara contra hoy_bogota()).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase, rpc } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

async function fechaBogota(instante: string): Promise<string> {
  const r = await db.query<{ f: string }>(`select public.fecha_bogota($1::timestamptz)::text as f`, [instante]);
  return r.rows[0].f;
}

describe("fecha_bogota", () => {
  it("antes de las 7 p. m. de Bogotá (medianoche UTC) sigue siendo el mismo día", async () => {
    expect(await fechaBogota("2026-10-17T23:59:00Z")).toBe("2026-10-17");
  });

  it("después de medianoche UTC todavía es el día anterior en Bogotá (UTC−5)", async () => {
    expect(await fechaBogota("2026-10-18T03:00:00Z")).toBe("2026-10-17");
    expect(await fechaBogota("2026-10-18T04:59:59Z")).toBe("2026-10-17");
    expect(await fechaBogota("2026-10-18T05:00:00Z")).toBe("2026-10-18");
  });
});

describe("fn_bloquear_borrado", () => {
  beforeAll(async () => {
    await db.exec(`
      create table public.prueba_borrado (id int primary key);
      alter table public.prueba_borrado enable row level security;
      create trigger trg_bloquear_borrado before delete on public.prueba_borrado
        for each row execute function public.fn_bloquear_borrado();
      insert into public.prueba_borrado values (1), (2);
    `);
  });

  afterAll(async () => {
    await db.exec(`drop table public.prueba_borrado`);
  });

  it("impide borrar incluso al dueño de la base", async () => {
    await expect(db.query(`delete from public.prueba_borrado where id = 1`)).rejects.toMatchObject({ code: "42501" });
    const r = await db.query(`select id from public.prueba_borrado`);
    expect(r.rows).toHaveLength(2);
  });

  it("solo deja borrar durante el reinicio de la demo", async () => {
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('app.reiniciando_demo', 'on', true)`);
      await tx.query(`delete from public.prueba_borrado where id = 2`);
    });
    const r = await db.query<{ id: number }>(`select id from public.prueba_borrado`);
    expect(r.rows.map((x) => x.id)).toEqual([1]);
  });
});

describe("publico_salud", () => {
  it("responde a un visitante sin sesión y no expone datos", async () => {
    const salud = await rpc<{ ok: boolean; hoy: string }>(db, null, "publico_salud");
    const hoy = await db.query<{ hoy: string }>(`select public.hoy_bogota()::text as hoy`);
    expect(salud).toEqual({ ok: true, hoy: hoy.rows[0].hoy });
  });
});
