import { describe, expect, it } from "vitest";
import { formatearMiles, formatearPesos, leerPesos } from "./dinero";

describe("formatearPesos / formatearMiles", () => {
  it.each([
    [0, "$ 0"],
    [999, "$ 999"],
    [12500, "$ 12.500"],
    [180000, "$ 180.000"],
    [1250000, "$ 1.250.000"],
    [-5000, "− $ 5.000"],
  ])("%s -> %s", (n, texto) => {
    expect(formatearPesos(n)).toBe(texto);
  });

  it("sin símbolo para los campos", () => {
    expect(formatearMiles(180000)).toBe("180.000");
  });
});

describe("leerPesos", () => {
  it.each([
    ["180.000", 180000],
    ["$ 180 000", 180000],
    ["180,000", 180000],
    ["0", 0],
    ["007", 7],
    ["", null],
    ["abc", null],
    ["123456789", 12345678],
  ])("%j -> %j", (texto, valor) => {
    expect(leerPesos(texto)).toBe(valor);
  });
});
