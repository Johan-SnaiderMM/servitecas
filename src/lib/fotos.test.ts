import { describe, expect, it } from "vitest";
import { esJpeg, esRutaFotoOrden, esUuid, rutaFotoOrden } from "./fotos";

const T = "11111111-1111-4111-8111-111111111111";
const O = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("rutaFotoOrden", () => {
  it("arma taller/orden/clave.jpg", () => {
    expect(rutaFotoOrden(T, O, C)).toBe(`${T}/${O}/${C}.jpg`);
  });

  it("rechaza ids que no son uuid (nada de ../ ni nombres raros)", () => {
    expect(rutaFotoOrden("../..", O, C)).toBeNull();
    expect(rutaFotoOrden(T, O, "foto")).toBeNull();
    expect(rutaFotoOrden("AAAAAAAA-1111-4111-8111-111111111111", O, C)).toBeNull(); // la base usa minúsculas
  });
});

describe("esRutaFotoOrden y esUuid", () => {
  it("solo aceptan la forma exacta", () => {
    expect(esRutaFotoOrden(`${T}/${O}/${C}.jpg`)).toBe(true);
    expect(esRutaFotoOrden(`${T}/${O}/${C}.png`)).toBe(false);
    expect(esRutaFotoOrden(`${T}/${C}.jpg`)).toBe(false);
    expect(esRutaFotoOrden(null)).toBe(false);
    expect(esUuid(C)).toBe(true);
    expect(esUuid("abc")).toBe(false);
  });
});

describe("esJpeg", () => {
  it("reconoce un JPEG por sus primeros bytes", () => {
    expect(esJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(esJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false); // PNG
    expect(esJpeg(new Uint8Array([0xff]))).toBe(false);
  });
});
