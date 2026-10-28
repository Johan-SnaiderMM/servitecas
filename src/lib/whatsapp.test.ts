import { describe, expect, it } from "vitest";
import { enlaceWhatsappA, enlaceWhatsappSinNumero, mensajeSeguimiento } from "./whatsapp";

describe("enlaces de WhatsApp", () => {
  it("sin número abre la lista de contactos con el mensaje", () => {
    expect(enlaceWhatsappSinNumero("Hola mundo")).toBe("https://wa.me/?text=Hola%20mundo");
  });

  it("con número va directo al chat, sin el +", () => {
    expect(enlaceWhatsappA("+573001234567", "Hola")).toBe("https://wa.me/573001234567?text=Hola");
  });

  it("sin un celular válido no hay enlace", () => {
    expect(enlaceWhatsappA(null, "Hola")).toBeNull();
    expect(enlaceWhatsappA("3001234567", "Hola")).toBeNull();
  });

  it("cambia los espacios finos por espacios normales", () => {
    expect(decodeURIComponent(enlaceWhatsappSinNumero("2:35 p. m.").split("?text=")[1])).toBe("2:35 p. m.");
  });
});

describe("mensajeSeguimiento", () => {
  const base = { taller: "Llantas Alfa", placa: "ABC123", enlace: "https://x.co/o/123" };

  it("saluda por el primer nombre y lleva la placa con formato y el enlace", () => {
    const m = mensajeSeguimiento({ ...base, cliente: "Juan Pérez" });
    expect(m).toContain("Hola Juan, recibimos tu vehículo ABC 123 en Llantas Alfa.");
    expect(m).toContain(base.enlace);
  });

  it("sin nombre saluda igual", () => {
    expect(mensajeSeguimiento({ ...base, cliente: null })).toMatch(/^Hola, recibimos/);
  });
});
