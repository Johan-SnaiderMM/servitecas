import { describe, expect, it } from "vitest";
import { textoPinRechazado } from "./demo";

describe("textoPinRechazado", () => {
  it("cuenta los intentos que quedan y avisa el bloqueo", () => {
    expect(textoPinRechazado({ ok: false, motivo: "pin", intentos_restantes: 3 })).toBe("El PIN no coincide. Te quedan 3 intentos.");
    expect(textoPinRechazado({ ok: false, motivo: "pin", intentos_restantes: 1 })).toContain("Te queda 1 intento");
    expect(textoPinRechazado({ ok: false, motivo: "bloqueado", minutos: 5 })).toBe("Demasiados intentos. Espera 5 minutos y vuelve a probar.");
    expect(textoPinRechazado({ ok: false, motivo: "bloqueado", minutos: 1 })).toContain("1 minuto ");
  });
});
