import { describe, expect, it } from "vitest";
import { escalarA } from "./imagen";

describe("escalarA", () => {
  it("no agranda ni toca una imagen que ya cabe", () => {
    expect(escalarA(800, 600, 1280)).toEqual({ ancho: 800, alto: 600 });
    expect(escalarA(1280, 1280, 1280)).toEqual({ ancho: 1280, alto: 1280 });
  });

  it("baja el lado más largo al máximo y mantiene la proporción", () => {
    expect(escalarA(4000, 3000, 1280)).toEqual({ ancho: 1280, alto: 960 });
    expect(escalarA(3000, 4000, 1280)).toEqual({ ancho: 960, alto: 1280 });
    expect(escalarA(4032, 3024, 1280)).toEqual({ ancho: 1280, alto: 960 });
  });

  it("nunca deja un lado en cero", () => {
    expect(escalarA(10000, 1, 100)).toEqual({ ancho: 100, alto: 1 });
  });
});
