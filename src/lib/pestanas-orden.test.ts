import { describe, expect, it } from "vitest";
import { ESTADOS } from "./ordenes";
import { avisosPestanas, esPestanaOrden, ETIQUETA_PESTANA, PESTANAS_ORDEN, pestanaInicial, textoAviso } from "./pestanas-orden";

describe("pestañas de la orden", () => {
  it("todas tienen etiqueta y esPestanaOrden distingue lo válido", () => {
    expect(Object.keys(ETIQUETA_PESTANA).sort()).toEqual([...PESTANAS_ORDEN].sort());
    expect(esPestanaOrden("mensajes")).toBe(true);
    expect(esPestanaOrden("historia")).toBe(false);
    expect(esPestanaOrden(null)).toBe(false);
  });
});

describe("pestanaInicial", () => {
  const base = { sinLeer: 0, estado: "diagnostico" } as const;

  it("la dirección manda (avisos push, recargar)", () => {
    expect(pestanaInicial({ ...base, ver: "fotos", recien: true, sinLeer: 3 })).toBe("fotos");
  });

  it("una dirección inventada no cuenta", () => {
    expect(pestanaInicial({ ...base, ver: "historia" })).toBe("orden");
  });

  it("recién registrado un hallazgo abre en hallazgos, antes que los mensajes", () => {
    expect(pestanaInicial({ ...base, recien: true, sinLeer: 2 })).toBe("hallazgos");
  });

  it("si el cliente escribió algo sin leer abre en mensajes, aunque esté Recibido", () => {
    expect(pestanaInicial({ ...base, sinLeer: 1, estado: "recibido" })).toBe("mensajes");
  });

  it("mientras está Recibido abre en fotos; después, en la orden", () => {
    expect(pestanaInicial({ ...base, estado: "recibido" })).toBe("fotos");
    for (const estado of ESTADOS.filter((e) => e !== "recibido")) expect(pestanaInicial({ ...base, estado })).toBe("orden");
  });
});

describe("avisosPestanas", () => {
  const base = { pendientes: 0, sinLeer: 0, fotos: 3, estado: "diagnostico" } as const;

  it("sin nada pendiente no hay avisos", () => {
    expect(avisosPestanas(base)).toEqual({ orden: null, hallazgos: null, mensajes: null, fotos: null });
  });

  it("cuenta los hallazgos que esperan al cliente y los mensajes sin leer", () => {
    expect(avisosPestanas({ ...base, pendientes: 2, sinLeer: 1 })).toMatchObject({ hallazgos: 2, mensajes: 1 });
  });

  it("con la orden cerrada un hallazgo sin respuesta ya no avisa; un mensaje sin leer sí", () => {
    for (const estado of ["entregado", "cancelada"] as const) {
      expect(avisosPestanas({ ...base, pendientes: 1, sinLeer: 1, estado })).toMatchObject({ hallazgos: null, mensajes: 1 });
    }
  });

  it("faltan las fotos solo mientras está Recibido", () => {
    expect(avisosPestanas({ ...base, fotos: 0, estado: "recibido" }).fotos).toBe("punto");
    expect(avisosPestanas({ ...base, fotos: 1, estado: "recibido" }).fotos).toBeNull();
    expect(avisosPestanas({ ...base, fotos: 0, estado: "en_proceso" }).fotos).toBeNull();
  });
});

describe("textoAviso", () => {
  it("dice el aviso en palabras", () => {
    expect(textoAviso("hallazgos", 1)).toBe("1 esperando al cliente");
    expect(textoAviso("mensajes", 1)).toBe("1 sin leer");
    expect(textoAviso("mensajes", 3)).toBe("3 sin leer");
    expect(textoAviso("fotos", "punto")).toBe("faltan las fotos de ingreso");
    expect(textoAviso("orden", null)).toBeNull();
  });
});
