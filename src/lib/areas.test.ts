import { describe, expect, it } from "vitest";
import type { Contexto } from "./contexto";
import { abre, AREAS, esArea, ETIQUETA_AREA, PANTALLAS, puedeVer, quienEs } from "./areas";

describe("áreas", () => {
  it("toda área tiene su etiqueta", () => {
    expect(Object.keys(ETIQUETA_AREA).sort()).toEqual([...AREAS].sort());
  });

  it("no hay áreas repetidas", () => {
    expect(new Set(AREAS).size).toBe(AREAS.length);
  });

  it("esArea distingue lo válido", () => {
    expect(esArea("patio")).toBe(true);
    expect(esArea("inventada")).toBe(false);
    expect(esArea(null)).toBe(false);
  });
});

describe("abre", () => {
  it("es verdadera si abre ALGUNA de las áreas pedidas", () => {
    expect(abre(["recepcion", "clientes"], "patio", "recepcion")).toBe(true);
    expect(abre(["recepcion"], "patio")).toBe(false);
  });

  it("sin áreas (o sin taller) no abre nada", () => {
    expect(abre([], "patio")).toBe(false);
    expect(abre(null, "patio")).toBe(false);
    expect(abre(undefined, "patio")).toBe(false);
  });
});

describe("PANTALLAS", () => {
  it("solo usa áreas que existen", () => {
    for (const [pantalla, requeridas] of Object.entries(PANTALLAS)) {
      for (const a of (requeridas ?? []) as readonly string[]) {
        expect(esArea(a), `${pantalla} pide el área inexistente ${a}`).toBe(true);
      }
    }
  });

  it("inicio y más están abiertas a cualquiera del taller, incluso sin roles", () => {
    expect(puedeVer({ areas: [] }, "inicio")).toBe(true);
    expect(puedeVer({ areas: [] }, "mas")).toBe(true);
  });

  it("el jefe de patio no ve el equipo", () => {
    expect(puedeVer({ areas: ["recepcion", "patio", "clientes"] }, "equipo")).toBe(false);
  });

  it("el dueño (todas las áreas) ve todo", () => {
    for (const p of Object.keys(PANTALLAS) as (keyof typeof PANTALLAS)[]) {
      expect(puedeVer({ areas: AREAS }, p)).toBe(true);
    }
  });
});

describe("quienEs", () => {
  const base: Contexto = {
    taller: { id: "t", nombre: "Alfa", slug: "alfa", es_demo: false, reinicio_con_pin: false, whatsapp: null, direccion: null },
    perfil: { nombre: "Camilo", rol: "equipo", areas: ["recepcion", "patio"], roles: ["Jefe de patio"] },
  };

  it("arma quién es a partir del contexto", () => {
    expect(quienEs(base)).toEqual({
      nombre: "Camilo",
      esDueno: false,
      areas: ["recepcion", "patio"],
      roles: ["Jefe de patio"],
    });
  });

  it("el rol dueño marca esDueno", () => {
    expect(quienEs({ ...base, perfil: { ...base.perfil!, rol: "dueno" } })?.esDueno).toBe(true);
  });

  it("sin perfil no es nadie", () => {
    expect(quienEs({ taller: null, perfil: null })).toBeNull();
  });
});
