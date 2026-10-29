import { describe, expect, it } from "vitest";
import { armarAviso, armarAvisoMensaje, llaveVapidABytes } from "./avisos-push";

const base = {
  orden_id: "o1",
  numero: 12,
  estado: "autorizado" as const,
  titulo: "Pastillas de freno delanteras gastadas",
  placa: "ABC123",
  cliente: "Juan",
};

describe("armarAviso", () => {
  it("autorizado: placa en el título, quién y qué en el cuerpo, y abre la orden", () => {
    expect(armarAviso(base)).toEqual({
      titulo: "✓ Autorizado · ABC 123",
      cuerpo: "Juan autorizó: Pastillas de freno delanteras gastadas (orden #12)",
      url: "/ordenes/o1?ver=hallazgos",
      tag: "orden-o1",
    });
  });

  it("rechazado y sin nombre", () => {
    const a = armarAviso({ ...base, estado: "rechazado", cliente: null });
    expect(a.titulo).toBe("No autorizó · ABC 123");
    expect(a.cuerpo).toBe("El cliente no autorizó: Pastillas de freno delanteras gastadas (orden #12)");
  });
});

describe("armarAvisoMensaje", () => {
  const m = { orden_id: "o1", numero: 12, texto: "¿Ya está\nlisto?", placa: "ABC123", cliente: "Juan" };

  it("placa en el título, quién y qué escribió en el cuerpo, y abre los mensajes de la orden", () => {
    expect(armarAvisoMensaje(m)).toEqual({
      titulo: "Mensaje · ABC 123",
      cuerpo: "Juan: ¿Ya está listo?",
      url: "/ordenes/o1?ver=mensajes",
      tag: "mensaje-o1",
    });
  });

  it("un mensaje largo se corta y sin nombre dice «El cliente»", () => {
    const a = armarAvisoMensaje({ ...m, texto: "palabra ".repeat(30), cliente: null });
    expect(a.cuerpo.startsWith("El cliente: palabra")).toBe(true);
    expect(a.cuerpo.endsWith("…")).toBe(true);
    expect(a.cuerpo.length).toBeLessThanOrEqual("El cliente: ".length + 100);
  });
});

describe("llaveVapidABytes", () => {
  it("decodifica base64 url sin relleno", () => {
    expect(Array.from(llaveVapidABytes("AQID_w"))).toEqual([1, 2, 3, 255]);
  });
});
