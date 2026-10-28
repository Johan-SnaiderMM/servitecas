import { describe, expect, it } from "vitest";
import {
  ALFABETO_CODIGO,
  codigoValido,
  enlaceWhatsappInvitacion,
  formatearCodigo,
  mensajeInvitacion,
  normalizarCodigo,
} from "./invitaciones";

describe("normalizarCodigo", () => {
  it("pasa a mayúsculas y deja solo letras y números", () => {
    expect(normalizarCodigo("k7mp-2xq9")).toBe("K7MP2XQ9");
    expect(normalizarCodigo("  K7MP 2XQ9  ")).toBe("K7MP2XQ9");
    expect(normalizarCodigo("k7mp_2xq9!")).toBe("K7MP2XQ9");
    expect(normalizarCodigo("")).toBe("");
  });
});

describe("codigoValido", () => {
  it("acepta 8 caracteres del alfabeto (sin 0, O, 1, I)", () => {
    expect(codigoValido("K7MP2XQ9")).toBe(true);
    expect(codigoValido("ABCDEFGH")).toBe(true);
  });

  it("rechaza largo distinto o caracteres que se confunden", () => {
    expect(codigoValido("K7MP2XQ")).toBe(false);
    expect(codigoValido("K7MP2XQ99")).toBe(false);
    for (const malo of ["0", "O", "1", "I"]) expect(codigoValido(`K7MP2XQ${malo}`)).toBe(false);
    expect(codigoValido("k7mp2xq9")).toBe(false); // se normaliza ANTES de validar
  });

  it("el alfabeto no tiene los caracteres ambiguos", () => {
    expect(ALFABETO_CODIGO).toHaveLength(32);
    for (const c of "01OI") expect(ALFABETO_CODIGO).not.toContain(c);
  });
});

describe("formatearCodigo", () => {
  it("separa en dos grupos de 4", () => {
    expect(formatearCodigo("K7MP2XQ9")).toBe("K7MP-2XQ9");
  });
  it("deja igual lo que no tiene 8 caracteres", () => {
    expect(formatearCodigo("K7MP")).toBe("K7MP");
  });
});

describe("mensaje de la invitación", () => {
  const d = { nombre: "Pedro", taller: "Llantas Alfa", codigo: "K7MP2XQ9", enlace: "https://x.co/unirme?codigo=K7MP2XQ9" };

  it("lleva el nombre, el taller, el enlace y el código con formato", () => {
    const m = mensajeInvitacion(d);
    expect(m).toContain("Hola Pedro");
    expect(m).toContain("Llantas Alfa");
    expect(m).toContain(d.enlace);
    expect(m).toContain("K7MP-2XQ9");
  });

  it("el enlace de WhatsApp lo codifica sin número", () => {
    const url = enlaceWhatsappInvitacion(mensajeInvitacion(d));
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(mensajeInvitacion(d));
  });
});
