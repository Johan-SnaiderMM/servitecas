import { describe, expect, it } from "vitest";
import { CATEGORIAS, ETIQUETA_CATEGORIA, ETIQUETA_HALLAZGO, esCategoria, mensajeHallazgo, textoPrecio } from "./hallazgos";

describe("categorías", () => {
  it("toda categoría tiene su etiqueta y no hay repetidas", () => {
    expect(Object.keys(ETIQUETA_CATEGORIA).sort()).toEqual([...CATEGORIAS].sort());
    expect(new Set(CATEGORIAS).size).toBe(CATEGORIAS.length);
  });

  it("esCategoria distingue lo válido", () => {
    expect(esCategoria("frenos")).toBe(true);
    expect(esCategoria("carroceria")).toBe(false);
  });

  it("todos los estados tienen etiqueta", () => {
    expect(Object.keys(ETIQUETA_HALLAZGO).sort()).toEqual(["anulado", "autorizado", "pendiente", "rechazado"]);
  });
});

describe("mensajeHallazgo", () => {
  const base = {
    cliente: "Juan Pérez",
    placa: "ABC123",
    titulo: "Pastillas de freno delanteras gastadas",
    descripcion: "Las pastillas están por debajo del mínimo: el carro tarda más en frenar.",
    precio: 180000,
    enlace: "https://x.co/o/abc",
  };

  it("saluda, dice qué se encontró, por qué, cuánto vale y lleva el enlace", () => {
    const m = mensajeHallazgo(base);
    expect(m).toContain("Hola Juan, revisando tu vehículo ABC 123 encontramos: *Pastillas de freno delanteras gastadas*.");
    expect(m).toContain(base.descripcion);
    expect(m).toContain("Valor: $ 180.000.");
    expect(m).toContain(`autoriza aquí: ${base.enlace}`);
  });

  it("sin precio promete confirmarlo; sin nombre saluda igual", () => {
    const m = mensajeHallazgo({ ...base, cliente: null, precio: null });
    expect(m.startsWith("Hola, revisando")).toBe(true);
    expect(m).toContain("Te confirmamos el valor.");
    expect(textoPrecio(null)).toBe("Te confirmamos el valor");
    expect(textoPrecio(0)).toBe("$ 0");
  });
});
