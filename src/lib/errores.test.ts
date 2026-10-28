import { describe, expect, it } from "vitest";
import { ErrorApp, MENSAJE_GENERICO, mensajeDeError } from "./errores";

describe("mensajeDeError", () => {
  it("muestra tal cual los mensajes de negocio en español", () => {
    expect(mensajeDeError({ codigo: "P0001", mensaje: "La placa no es válida." })).toBe("La placa no es válida.");
    expect(mensajeDeError({ codigo: "P0002", mensaje: "No existe la orden." })).toBe("No existe la orden.");
    expect(mensajeDeError({ codigo: "42501", mensaje: "Solo el dueño puede hacer esto." })).toBe(
      "Solo el dueño puede hacer esto."
    );
  });

  it("oculta los errores técnicos de Postgres", () => {
    expect(mensajeDeError({ codigo: "42501", mensaje: "permission denied for table talleres" })).toBe(MENSAJE_GENERICO);
    expect(mensajeDeError({ codigo: "23505", mensaje: "duplicate key value violates unique constraint" })).toBe(
      MENSAJE_GENERICO
    );
    expect(mensajeDeError({})).toBe(MENSAJE_GENERICO);
  });
});

describe("ErrorApp", () => {
  it("lleva mensaje y código", () => {
    const e = new ErrorApp("Algo pasó", "P0001");
    expect(e.message).toBe("Algo pasó");
    expect(e.codigo).toBe("P0001");
    expect(e).toBeInstanceOf(Error);
  });
});
