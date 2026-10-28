import { describe, expect, it } from "vitest";
import { CASOS_TELEFONO } from "@/test/casos-telefono";
import { digitosParaWhatsapp, ERROR_TELEFONO, formatearTelefono, normalizarTelefono } from "./telefono";

describe("normalizarTelefono", () => {
  it.each(CASOS_TELEFONO)("%j -> %j", (entrada, esperado) => {
    const r = normalizarTelefono(entrada);
    if (esperado === "ERROR") {
      expect(r).toEqual({ ok: false, error: ERROR_TELEFONO });
    } else {
      expect(r).toEqual({ ok: true, valor: esperado });
    }
  });
});

describe("formatearTelefono", () => {
  it("separa un celular colombiano en 3 + 3 + 4", () => {
    expect(formatearTelefono("+573001234567")).toBe("300 123 4567");
  });

  it("deja igual lo que no es colombiano y tolera vacíos", () => {
    expect(formatearTelefono("+13055551234")).toBe("+13055551234");
    expect(formatearTelefono(null)).toBe("");
    expect(formatearTelefono("")).toBe("");
  });
});

describe("digitosParaWhatsapp", () => {
  it("quita el + y deja solo dígitos", () => {
    expect(digitosParaWhatsapp("+573001234567")).toBe("573001234567");
  });
});
