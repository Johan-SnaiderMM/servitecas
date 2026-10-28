import { describe, expect, it } from "vitest";
import { esPeriodo, porcentajeAutorizado, rangoDe, textoDuracion, textoRango } from "./resumen";

describe("rangoDe", () => {
  const hoy = "2026-10-21";

  it("hoy, 7 y 30 días terminan hoy e incluyen hoy", () => {
    expect(rangoDe("hoy", hoy)).toEqual({ desde: "2026-10-21", hasta: "2026-10-21" });
    expect(rangoDe("7", hoy)).toEqual({ desde: "2026-10-15", hasta: "2026-10-21" });
    expect(rangoDe("30", hoy)).toEqual({ desde: "2026-09-22", hasta: "2026-10-21" });
  });

  it("este mes arranca el día 1 (y cruza bien el cambio de año)", () => {
    expect(rangoDe("mes", hoy)).toEqual({ desde: "2026-10-01", hasta: "2026-10-21" });
    expect(rangoDe("7", "2027-01-03")).toEqual({ desde: "2026-12-28", hasta: "2027-01-03" });
  });
});

describe("textoRango", () => {
  it("un día, una semana y un mes", () => {
    expect(textoRango("2026-10-21", "2026-10-21", "2026-10-21")).toBe("Hoy, mié 21 oct");
    expect(textoRango("2026-10-15", "2026-10-21", "2026-10-21")).toBe("jue 15 oct – mié 21 oct");
    expect(textoRango("2026-09-22", "2026-10-21", "2026-10-21")).toBe("22 sep – 21 oct");
  });
});

describe("porcentajeAutorizado", () => {
  it("sobre los que respondieron; sin respuestas no hay porcentaje", () => {
    expect(porcentajeAutorizado(3, 1)).toBe(75);
    expect(porcentajeAutorizado(1, 2)).toBe(33);
    expect(porcentajeAutorizado(0, 0)).toBeNull();
  });
});

describe("esPeriodo", () => {
  it("solo los cuatro periodos", () => {
    expect(esPeriodo("7")).toBe(true);
    expect(esPeriodo("365")).toBe(false);
    expect(esPeriodo(undefined)).toBe(false);
  });
});

describe("textoDuracion", () => {
  it("menos de un minuto no dice «0 min»", () => {
    expect(textoDuracion(0)).toBe("menos de 1 min");
    expect(textoDuracion(21)).toBe("21 min");
    expect(textoDuracion(125)).toBe("2 h 5 min");
  });
});
