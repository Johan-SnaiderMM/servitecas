/**
 * Fotos de ingreso (migración 0007, SPEC F3): registrar, quitar, quién las ve, el enlace del cliente y las reglas del
 * bucket. La ruta del archivo nunca sale en las respuestas de la API: se pide por id.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rutaFotoOrden } from "@/lib/fotos";
import { como, crearBase, crearMiembro, crearRol, crearTaller, rpc, type TallerDePrueba } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

type Escenario = TallerDePrueba & { jefe: string; ayudante: string; orden: { id: string; token: string } };

let contador = 0;
/** Un taller con un jefe de patio, alguien sin acceso a vehículos y una orden abierta. */
async function escenario(): Promise<Escenario> {
  contador += 1;
  const t = await crearTaller(db, `Llantas ${contador}`);
  const jefe = await crearMiembro(db, t.tallerId, "Camilo Ruiz", ["Jefe de patio"]);
  await crearRol(db, t.tallerId, "Ayudante", ["catalogo"]);
  const ayudante = await crearMiembro(db, t.tallerId, "Ana", ["Ayudante"]);
  const orden = await rpc<{ id: string; token: string }>(db, t.userId, "recibir_vehiculo", {
    p_clave: crypto.randomUUID(),
    p_placa: "ABC123",
    p_celular: "3001234567",
    p_servicio: "Llantas",
  });
  return { ...t, jefe, ayudante, orden };
}

const registrar = (actor: string | null, orden: string, clave = crypto.randomUUID()) =>
  rpc<{ id: string; repetida: boolean }>(db, actor, "registrar_foto_orden", { p_clave: clave, p_orden: orden });

type OrdenConFotos = { fotos: { id: string; tipo: string; autor: string | null; at: string }[] };

describe("registrar_foto_orden", () => {
  it("guarda la foto con la ruta del taller, la orden y la clave, y su autor", async () => {
    const e = await escenario();
    const clave = crypto.randomUUID();
    expect(await registrar(e.jefe, e.orden.id, clave)).toEqual({ id: clave, repetida: false });

    const { rows } = await db.query<{ ruta: string; autor: string; tipo: string }>(
      `select ruta, autor, tipo from public.fotos_orden where id = $1`,
      [clave]
    );
    expect(rows[0]).toEqual({ ruta: rutaFotoOrden(e.tallerId, e.orden.id, clave), autor: "Camilo Ruiz", tipo: "ingreso" });
  });

  it("un reintento con la misma clave no la duplica; la clave de otro taller u otra orden, no sirve", async () => {
    const a = await escenario();
    const b = await escenario();
    const clave = crypto.randomUUID();
    await registrar(a.jefe, a.orden.id, clave);
    expect(await registrar(a.jefe, a.orden.id, clave)).toEqual({ id: clave, repetida: true });
    await expect(registrar(b.jefe, b.orden.id, clave)).rejects.toMatchObject({ code: "P0001" });
    const { rows } = await db.query(`select 1 from public.fotos_orden where id = $1`, [clave]);
    expect(rows).toHaveLength(1);
  });

  it("solo en órdenes abiertas del propio taller", async () => {
    const a = await escenario();
    const b = await escenario();
    await expect(registrar(b.jefe, a.orden.id)).rejects.toMatchObject({ code: "P0002" });
    await rpc(db, a.userId, "cambiar_estado_orden", { p_id: a.orden.id, p_estado: "entregado" });
    await expect(registrar(a.jefe, a.orden.id)).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("ya está cerrada"),
    });
  });

  it("hasta 12 fotos de ingreso por orden (las quitadas no cuentan)", async () => {
    const e = await escenario();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push((await registrar(e.jefe, e.orden.id)).id);
    await expect(registrar(e.jefe, e.orden.id)).rejects.toMatchObject({ message: expect.stringContaining("12 fotos") });
    await rpc(db, e.jefe, "quitar_foto_orden", { p_id: ids[0] });
    await expect(registrar(e.jefe, e.orden.id)).resolves.toBeTruthy();
  });

  it("quien no trabaja vehículos ni un visitante sin sesión registran fotos", async () => {
    const e = await escenario();
    await expect(registrar(e.ayudante, e.orden.id)).rejects.toMatchObject({ code: "42501" });
    await expect(registrar(null, e.orden.id)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("ver y quitar fotos (personal)", () => {
  it("obtener_orden trae las fotos por id, sin la ruta; al quitarla deja de aparecer", async () => {
    const e = await escenario();
    const f1 = await registrar(e.jefe, e.orden.id);
    const f2 = await registrar(e.userId, e.orden.id);
    let o = await rpc<OrdenConFotos>(db, e.jefe, "obtener_orden", { p_id: e.orden.id });
    expect(o.fotos.map((f) => f.id)).toEqual([f1.id, f2.id]);
    expect(JSON.stringify(o.fotos)).not.toContain(".jpg");

    await rpc(db, e.jefe, "quitar_foto_orden", { p_id: f1.id, p_motivo: "Salió borrosa" });
    o = await rpc<OrdenConFotos>(db, e.jefe, "obtener_orden", { p_id: e.orden.id });
    expect(o.fotos.map((f) => f.id)).toEqual([f2.id]);
    const { rows } = await db.query<{ motivo_anulacion: string }>(`select motivo_anulacion from public.fotos_orden where id = $1`, [
      f1.id,
    ]);
    expect(rows[0].motivo_anulacion).toBe("Salió borrosa");
    await expect(rpc(db, e.jefe, "quitar_foto_orden", { p_id: f1.id })).rejects.toMatchObject({ code: "P0002" });
  });

  it("ruta_foto_orden solo responde al personal del taller y para fotos vigentes", async () => {
    const a = await escenario();
    const b = await escenario();
    const f = await registrar(a.jefe, a.orden.id);
    expect(await rpc(db, a.jefe, "ruta_foto_orden", { p_id: f.id })).toBe(rutaFotoOrden(a.tallerId, a.orden.id, f.id));
    expect(await rpc(db, b.jefe, "ruta_foto_orden", { p_id: f.id })).toBeNull();
    await expect(rpc(db, a.ayudante, "ruta_foto_orden", { p_id: f.id })).rejects.toMatchObject({ code: "42501" });
    await expect(rpc(db, b.jefe, "quitar_foto_orden", { p_id: f.id })).rejects.toMatchObject({ code: "P0002" });
    await rpc(db, a.jefe, "quitar_foto_orden", { p_id: f.id });
    expect(await rpc(db, a.jefe, "ruta_foto_orden", { p_id: f.id })).toBeNull();
  });

  it("nada se borra: la foto quitada sigue en la tabla", async () => {
    const e = await escenario();
    const f = await registrar(e.jefe, e.orden.id);
    await expect(db.query(`delete from public.fotos_orden where id = $1`, [f.id])).rejects.toMatchObject({ code: "42501" });
  });
});

describe("enlace del cliente", () => {
  type Publica = { existe: boolean; orden?: { fotos: { id: string; tipo: string }[] } };

  it("publico_orden trae las fotos por id, sin rutas ni ids del taller", async () => {
    const e = await escenario();
    const f = await registrar(e.jefe, e.orden.id);
    const p = await rpc<Publica>(db, null, "publico_orden", { p_token: e.orden.token });
    expect(p.orden!.fotos.map((x) => x.id)).toEqual([f.id]);
    const texto = JSON.stringify(p);
    expect(texto).not.toContain(".jpg");
    expect(texto).not.toContain(e.tallerId);
  });

  it("publico_ruta_foto da la ruta solo con el token de ESA orden y para fotos vigentes", async () => {
    const a = await escenario();
    const b = await escenario();
    const fa = await registrar(a.jefe, a.orden.id);
    const fb = await registrar(b.jefe, b.orden.id);
    const ruta = (token: string, foto: string) => rpc<string | null>(db, null, "publico_ruta_foto", { p_token: token, p_foto: foto });

    expect(await ruta(a.orden.token, fa.id)).toBe(rutaFotoOrden(a.tallerId, a.orden.id, fa.id));
    expect(await ruta(a.orden.token, fb.id)).toBeNull();
    expect(await ruta(b.orden.token, fa.id)).toBeNull();
    expect(await ruta(crypto.randomUUID(), fa.id)).toBeNull();
    await rpc(db, a.jefe, "quitar_foto_orden", { p_id: fa.id });
    expect(await ruta(a.orden.token, fa.id)).toBeNull();
  });

  it("30 días después de cerrada, las fotos tampoco se sirven", async () => {
    const e = await escenario();
    const f = await registrar(e.jefe, e.orden.id);
    await rpc(db, e.userId, "cambiar_estado_orden", { p_id: e.orden.id, p_estado: "entregado" });
    const ruta = async (dias: number) =>
      (
        await db.query<{ r: string | null }>(
          `select public.fn_publico_ruta_foto($1, $2, now() + make_interval(days => $3)) as r`,
          [e.orden.token, f.id, dias]
        )
      ).rows[0].r;
    expect(await ruta(29)).not.toBeNull();
    expect(await ruta(31)).toBeNull();
  });
});

describe("bucket de fotos", () => {
  const subir = (actor: string | null, ruta: string | null) =>
    como(db, actor, `insert into storage.objects (bucket_id, name) values ('fotos', $1)`, [ruta]);

  it("existe, acepta solo JPEG de hasta 1 MiB y se sirve sin sesión (por la app)", async () => {
    const { rows } = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = 'fotos'`
    );
    expect(rows[0]).toEqual({ public: true, file_size_limit: "1048576", allowed_mime_types: ["image/jpeg"] });
  });

  it("el personal sube solo en la carpeta de su taller; quien no trabaja vehículos, no", async () => {
    const a = await escenario();
    const b = await escenario();
    await expect(subir(a.jefe, rutaFotoOrden(a.tallerId, a.orden.id, crypto.randomUUID()))).resolves.toBeTruthy();
    await expect(subir(a.jefe, rutaFotoOrden(b.tallerId, b.orden.id, crypto.randomUUID()))).rejects.toMatchObject({
      code: "42501",
    });
    await expect(subir(a.ayudante, rutaFotoOrden(a.tallerId, a.orden.id, crypto.randomUUID()))).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("nadie lista el bucket sin sesión, y cada taller ve solo sus archivos", async () => {
    const a = await escenario();
    const b = await escenario();
    await subir(a.jefe, rutaFotoOrden(a.tallerId, a.orden.id, crypto.randomUUID()));
    await expect(como(db, null, `select name from storage.objects where bucket_id = 'fotos'`)).rejects.toMatchObject({
      code: "42501",
    });
    const deB = await como<{ name: string }>(db, b.jefe, `select name from storage.objects where bucket_id = 'fotos'`);
    expect(deB.filter((f) => f.name.startsWith(a.tallerId))).toEqual([]);
  });
});
