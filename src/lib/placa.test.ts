import { describe, expect, it } from "vitest";
import { CASOS_PLACA } from "@/test/casos-placa";
import { ERROR_PLACA, ERROR_PLACA_VACIA, formatearPlaca, normalizarPlaca, tipoPlaca } from "./placa";

describe("normalizarPlaca", () => {
  it.each(CASOS_PLACA)("%j -> %j", (entrada, esperado) => {
    const r = normalizarPlaca(entrada);
    if (esperado === "VACIA") expect(r).toEqual({ ok: false, error: ERROR_PLACA_VACIA });
    else if (esperado === "ERROR") expect(r).toEqual({ ok: false, error: ERROR_PLACA });
    else expect(r).toEqual({ ok: true, valor: esperado });
  });
});

describe("tipoPlaca", () => {
  it("reconoce carro y moto por su forma", () => {
    expect(tipoPlaca("ABC123")).toBe("carro");
    expect(tipoPlaca("ABC12D")).toBe("moto");
    expect(tipoPlaca("AB1234")).toBe("otro");
    expect(tipoPlaca("ABC12")).toBe("otro");
  });
});

describe("formatearPlaca", () => {
  it("separa las letras como en la placa", () => {
    expect(formatearPlaca("ABC123")).toBe("ABC 123");
    expect(formatearPlaca("ABC12D")).toBe("ABC 12D");
    expect(formatearPlaca("AB1234")).toBe("AB1234");
  });
});
