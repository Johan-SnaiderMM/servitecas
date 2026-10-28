/** Todas las pruebas de fechas usan instantes FIJOS, nunca el reloj. */
import { describe, expect, it } from "vitest";
import {
  diasEntre,
  fechaBogota,
  fechaCorta,
  fechaLarga,
  fechaRelativa,
  horaCorta,
  hoyBogota,
  instanteBogota,
  minutosDelDiaBogota,
  momentoCorto,
  sumarDias,
  textoDias,
} from "./fechas";

describe("hoyBogota", () => {
  it("usa el día de Bogotá (UTC-5), no el de UTC", () => {
    // 03:30 UTC = 22:30 del día anterior en Bogotá
    expect(hoyBogota(new Date("2026-10-15T03:30:00Z"))).toBe("2026-10-14");
    // 05:00 UTC = 00:00 en Bogotá: ya es el día nuevo
    expect(hoyBogota(new Date("2026-10-15T05:00:00Z"))).toBe("2026-10-15");
    expect(hoyBogota(new Date("2026-10-15T04:59:59Z"))).toBe("2026-10-14");
  });

  it("cruza el fin de año", () => {
    expect(hoyBogota(new Date("2027-01-01T04:00:00Z"))).toBe("2026-12-31");
  });
});

describe("nombres de fecha", () => {
  it("fechaLarga", () => {
    expect(fechaLarga("2026-10-05")).toBe("Lunes 5 de octubre");
    expect(fechaLarga("2026-12-25")).toBe("Viernes 25 de diciembre");
  });

  it("fechaCorta", () => {
    expect(fechaCorta("2026-10-05")).toBe("lun 5 oct");
    expect(fechaCorta("2026-03-01")).toBe("dom 1 mar");
  });

  it("fechaRelativa", () => {
    expect(fechaRelativa("2026-10-15", "2026-10-15")).toBe("Hoy");
    expect(fechaRelativa("2026-10-14", "2026-10-15")).toBe("Ayer");
    expect(fechaRelativa("2026-10-10", "2026-10-15")).toBe("sáb 10 oct");
  });

  it("textoDias", () => {
    expect(textoDias(0)).toBe("hoy");
    expect(textoDias(1)).toBe("ayer");
    expect(textoDias(5)).toBe("hace 5 días");
  });
});

describe("aritmética de días", () => {
  it("sumarDias cruza meses, años y bisiestos", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2026-10-15", 30)).toBe("2026-11-14");
  });

  it("diasEntre", () => {
    expect(diasEntre("2026-10-01", "2026-10-15")).toBe(14);
    expect(diasEntre("2026-10-15", "2026-10-01")).toBe(-14);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("horaCorta", () => {
  it("muestra la hora de Bogotá en 12 horas", () => {
    expect(horaCorta("2026-10-15T19:35:00Z")).toBe("2:35 p. m.");
    expect(horaCorta("2026-10-15T14:00:00Z")).toBe("9:00 a. m.");
    expect(horaCorta("2026-10-15T05:00:00Z")).toBe("12:00 a. m.");
  });
});

describe("instanteBogota", () => {
  it("arma el instante con el offset de Bogotá", () => {
    expect(instanteBogota("2026-11-02", 540)).toBe("2026-11-02T09:00:00-05:00");
    expect(instanteBogota("2026-11-02", 0)).toBe("2026-11-02T00:00:00-05:00");
    expect(instanteBogota("2026-11-02", 1139)).toBe("2026-11-02T18:59:00-05:00");
  });

  it("1440 es la medianoche final: las 00:00 del día siguiente, incluso cruzando el año", () => {
    expect(instanteBogota("2026-11-02", 1440)).toBe("2026-11-03T00:00:00-05:00");
    expect(instanteBogota("2026-12-31", 1440)).toBe("2027-01-01T00:00:00-05:00");
  });

  it("es el mismo instante que el reloj de Bogotá (UTC-5)", () => {
    expect(new Date(instanteBogota("2026-11-02", 540)).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });
});

describe("minutosDelDiaBogota / fechaBogota", () => {
  it("convierten un instante a la hora y el día de Bogotá", () => {
    expect(minutosDelDiaBogota("2026-11-02T14:00:00Z")).toBe(540);
    expect(minutosDelDiaBogota("2026-11-03T04:59:00Z")).toBe(1439);
    expect(minutosDelDiaBogota("2026-11-03T05:00:00Z")).toBe(0);
    expect(fechaBogota("2026-11-03T04:59:00Z")).toBe("2026-11-02");
    expect(fechaBogota("2026-11-03T05:00:00Z")).toBe("2026-11-03");
  });

  it("van y vuelven con instanteBogota", () => {
    const iso = instanteBogota("2026-11-02", 870);
    expect(minutosDelDiaBogota(iso)).toBe(870);
    expect(fechaBogota(iso)).toBe("2026-11-02");
  });
});

describe("momentoCorto", () => {
  // 9:40 a. m. en Bogotá del 21 de octubre de 2026 (miércoles).
  const iso = "2026-10-21T14:40:00Z";

  it("hoy dice «Hoy» (o solo la hora en las pantallas del personal); otro día, la fecha corta", () => {
    expect(momentoCorto(iso, "2026-10-21")).toBe(`Hoy, ${horaCorta(iso)}`);
    expect(momentoCorto(iso, "2026-10-21", { soloHoraSiEsHoy: true })).toBe(horaCorta(iso));
    expect(momentoCorto(iso, "2026-10-22")).toBe(`mié 21 oct, ${horaCorta(iso)}`);
  });
});
