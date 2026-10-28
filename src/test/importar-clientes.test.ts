/**
 * Carga de clientes (migración 0012, SPEC F9): 500 clientes ficticios de una vez, vista previa que no guarda nada,
 * volver a cargar no duplica, lo que ya está en la app manda, permisos y aislamiento entre talleres.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { revisarArchivo, type FilaLista } from "@/lib/importar-clientes";
import { crearBase, crearMiembro, crearRol, crearTaller, rpc } from "./base-datos";

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
});

afterAll(async () => {
  await db.close();
});

type Resultado = {
  guardado: boolean;
  clientes_nuevos: number;
  clientes_completados: number;
  vehiculos_nuevos: number;
  sin_cambios: number;
  errores: { fila: number; motivo: string }[];
  conflictos: { fila: number; motivo: string }[];
};

let contador = 0;
async function escenario() {
  contador += 1;
  const t = await crearTaller(db, `Serviteca I${contador}`);
  const recepcion = await crearMiembro(db, t.tallerId, "Daniela", ["Recepción"]);
  await crearRol(db, t.tallerId, "Catálogo", ["catalogo"]);
  const catalogo = await crearMiembro(db, t.tallerId, "Ana", ["Catálogo"]);
  return { ...t, recepcion, catalogo };
}

const importar = (actor: string, filas: FilaLista[], guardar: boolean) =>
  rpc<Resultado>(db, actor, "importar_clientes", { p_filas: filas, p_guardar: guardar });

const cuenta = async (tabla: "clientes" | "vehiculos", taller: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.${tabla} where taller_id = $1`, [taller])).rows[0].n;

/** Un CSV de 500 clientes ficticios (celulares +57 300 000 3xxx), revisado como en el celular. */
function quinientos(): FilaLista[] {
  const filas = Array.from({ length: 500 }, (_, i) => {
    const placa = `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}Z${String(i).padStart(3, "0")}`;
    return `${placa};Cliente ${i + 1};300 000 ${String(3000 + i).padStart(4, "0")}`;
  });
  const r = revisarArchivo(["placa;nombre;celular", ...filas].join("\n"));
  if (!r.ok) throw new Error(r.error);
  return r.revision.listas;
}

describe("cargar clientes", () => {
  it("500 clientes ficticios sin errores; la vista previa no guarda nada y dice lo mismo que guardar", async () => {
    const e = await escenario();
    const filas = quinientos();

    const previa = await importar(e.recepcion, filas, false);
    expect(previa).toEqual({
      guardado: false,
      clientes_nuevos: 500,
      clientes_completados: 0,
      vehiculos_nuevos: 500,
      sin_cambios: 0,
      errores: [],
      conflictos: [],
    });
    expect(await cuenta("clientes", e.tallerId)).toBe(0);

    expect(await importar(e.recepcion, filas, true)).toEqual({ ...previa, guardado: true });
    expect(await cuenta("clientes", e.tallerId)).toBe(500);
    expect(await cuenta("vehiculos", e.tallerId)).toBe(500);
  });

  it("volver a cargar el mismo archivo no duplica nada", async () => {
    const e = await escenario();
    const filas = quinientos().slice(0, 50);
    await importar(e.recepcion, filas, true);
    const otra = await importar(e.recepcion, filas, true);
    expect(otra).toMatchObject({ clientes_nuevos: 0, vehiculos_nuevos: 0, sin_cambios: 50 });
    expect(await cuenta("clientes", e.tallerId)).toBe(50);
  });

  it("al recibir el vehículo, la app ya conoce al cliente", async () => {
    const e = await escenario();
    await importar(e.recepcion, [{ fila: 2, placa: "ABC123", nombre: "Juan Pérez", celular: "+573001234567" }], true);
    const v = await rpc<{ existe: boolean; cliente: { nombre: string; celular: string } }>(db, e.recepcion, "buscar_vehiculo", {
      p_placa: "abc 123",
    });
    expect(v).toMatchObject({ existe: true, cliente: { nombre: "Juan Pérez", celular: "+573001234567" } });
  });

  it("lo que ya está en la app manda: el nombre solo se completa y el vehículo no cambia de dueño", async () => {
    const e = await escenario();
    await rpc(db, e.recepcion, "recibir_vehiculo", {
      p_clave: crypto.randomUUID(),
      p_placa: "ABC123",
      p_celular: "3001234567",
      p_nombre: "Juan Pérez",
      p_servicio: "Frenos",
    });
    await rpc(db, e.recepcion, "recibir_vehiculo", {
      p_clave: crypto.randomUUID(),
      p_placa: "DEF456",
      p_celular: "3110000000",
      p_servicio: "Despinche",
    });

    const r = await importar(
      e.recepcion,
      [
        { fila: 2, placa: "ABC123", nombre: "Otro Nombre", celular: "+573009999999" }, // placa de Juan con otro celular
        { fila: 3, placa: null, nombre: "Juanito", celular: "+573001234567" }, // Juan ya tiene nombre
        { fila: 4, placa: "DEF456", nombre: "Laura Gil", celular: "+573110000000" }, // sin nombre: se completa
      ],
      true
    );
    expect(r).toMatchObject({ clientes_nuevos: 1, clientes_completados: 1, vehiculos_nuevos: 0, sin_cambios: 1 });
    expect(r.conflictos).toEqual([{ fila: 2, motivo: "La placa ABC123 ya está registrada con otro cliente: no se cambió." }]);

    const { rows } = await db.query<{ celular: string; nombre: string | null }>(
      `select c.celular, c.nombre from public.clientes c where c.taller_id = $1 order by c.celular`,
      [e.tallerId]
    );
    expect(rows).toEqual([
      { celular: "+573001234567", nombre: "Juan Pérez" },
      { celular: "+573009999999", nombre: "Otro Nombre" },
      { celular: "+573110000000", nombre: "Laura Gil" },
    ]);
  });

  it("la base vuelve a revisar cada fila y sigue con las demás", async () => {
    const e = await escenario();
    const r = await importar(
      e.recepcion,
      [
        { fila: 2, placa: "X", nombre: null, celular: "+573001234567" },
        { fila: 3, placa: null, nombre: null, celular: "123" },
        { fila: 4, placa: "ABC123", nombre: null, celular: "" },
        { fila: 5, placa: "ABC123", nombre: "Bien", celular: "3001234567" },
      ],
      true
    );
    expect(r.errores.map((x) => x.fila)).toEqual([2, 3, 4]);
    expect(r.errores[0].motivo).toContain("placa no es válida");
    expect(r.errores[1].motivo).toContain("celular no es válido");
    expect(r).toMatchObject({ clientes_nuevos: 1, vehiculos_nuevos: 1 });
  });

  it("solo con el área clientes, cada taller en lo suyo y hasta 2.000 filas", async () => {
    const a = await escenario();
    const b = await escenario();
    const fila = [{ fila: 2, placa: "ABC123", nombre: "Juan", celular: "+573001234567" }];
    await expect(importar(a.catalogo, fila, true)).rejects.toMatchObject({ code: "42501" });

    await importar(a.recepcion, fila, true);
    expect(await importar(b.recepcion, fila, true)).toMatchObject({ clientes_nuevos: 1, vehiculos_nuevos: 1 });
    expect(await cuenta("clientes", a.tallerId)).toBe(1);
    expect(await cuenta("clientes", b.tallerId)).toBe(1);

    const muchas = Array.from({ length: 2001 }, (_, i) => ({ fila: i + 2, placa: null, nombre: null, celular: "+573001234567" }));
    await expect(importar(a.recepcion, muchas, false)).rejects.toMatchObject({ message: expect.stringContaining("2.000") });
    await expect(rpc(db, a.recepcion, "importar_clientes", { p_filas: { no: "lista" } })).rejects.toMatchObject({
      message: expect.stringContaining("No llegaron las filas"),
    });
  });
});
