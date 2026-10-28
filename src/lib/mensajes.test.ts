import { describe, expect, it } from "vitest";
import { MOTIVO_MENSAJE, mensajeRespuesta } from "./mensajes";

describe("mensajeRespuesta", () => {
  it("saluda por el primer nombre, dice la placa y lleva el enlace", () => {
    expect(mensajeRespuesta({ cliente: "Juan Pérez", placa: "ABC123", enlace: "https://x.test/o/t#mensajes" })).toBe(
      "Hola Juan, te respondimos sobre tu vehículo ABC 123.\nMíralo aquí: https://x.test/o/t#mensajes"
    );
  });

  it("sin nombre saluda sin nombre", () => {
    expect(mensajeRespuesta({ cliente: null, placa: "ABC12D", enlace: "e" }).startsWith("Hola, te respondimos")).toBe(true);
  });
});

describe("MOTIVO_MENSAJE", () => {
  it("cada motivo que devuelve la base tiene su texto", () => {
    for (const m of ["no_existe", "cerrada", "vacio", "largo", "limite"]) expect(MOTIVO_MENSAJE[m]).toBeTruthy();
  });
});
