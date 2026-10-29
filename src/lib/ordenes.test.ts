import { describe, expect, it } from "vitest";
import {
  ESTADOS,
  ESTADOS_ABIERTOS,
  ETIQUETA_ESTADO,
  esEstado,
  estaAbierta,
  filtrarPatio,
  primerNombre,
  siguienteEstado,
  TEXTO_CLIENTE,
  textoAvanzar,
  textoHace,
  textoTiempo,
} from "./ordenes";

describe("estados", () => {
  it("todos tienen etiqueta para el personal y texto para el cliente", () => {
    expect(Object.keys(ETIQUETA_ESTADO).sort()).toEqual([...ESTADOS].sort());
    expect(Object.keys(TEXTO_CLIENTE).sort()).toEqual([...ESTADOS].sort());
  });

  it("los abiertos son los cuatro primeros", () => {
    expect(ESTADOS_ABIERTOS).toEqual(ESTADOS.slice(0, 4));
    expect(estaAbierta("listo")).toBe(true);
    expect(estaAbierta("entregado")).toBe(false);
    expect(estaAbierta("cancelada")).toBe(false);
  });

  it("esEstado distingue lo válido", () => {
    expect(esEstado("en_proceso")).toBe(true);
    expect(esEstado("perdido")).toBe(false);
  });
});

describe("siguienteEstado", () => {
  it("avanza paso a paso hasta entregado", () => {
    expect(siguienteEstado("recibido")).toBe("diagnostico");
    expect(siguienteEstado("diagnostico")).toBe("en_proceso");
    expect(siguienteEstado("en_proceso")).toBe("listo");
    expect(siguienteEstado("listo")).toBe("entregado");
  });

  it("una orden cerrada no tiene siguiente", () => {
    expect(siguienteEstado("entregado")).toBeNull();
    expect(siguienteEstado("cancelada")).toBeNull();
  });

  it("el texto del botón se lee natural", () => {
    expect(textoAvanzar("diagnostico")).toBe("Empezar diagnóstico");
    expect(textoAvanzar("en_proceso")).toBe("Empezar el trabajo");
    expect(textoAvanzar("recibido")).toBe("Pasar a recibido");
    expect(textoAvanzar("listo")).toBe("Marcar como listo");
    expect(textoAvanzar("entregado")).toBe("Entregar al cliente");
  });
});

describe("textoTiempo", () => {
  it.each([
    [0, "0 min"],
    [12.9, "12 min"],
    [60, "1 h"],
    [125, "2 h 5 min"],
    [24 * 60, "1 día"],
    [3 * 24 * 60 + 5, "3 días"],
    [-5, "0 min"],
  ])("%s -> %s", (minutos, texto) => {
    expect(textoTiempo(minutos)).toBe(texto);
  });
});

describe("textoHace", () => {
  it("menos de un minuto es ahora mismo", () => {
    expect(textoHace(0.5)).toBe("Ahora mismo");
    expect(textoHace(12)).toBe("Hace 12 min");
  });
});

describe("filtrarPatio", () => {
  const patio = [
    { placa: "ABC123", servicio: "Cambio de aceite", cliente: "Rubén Díaz", asignado: { nombre: "Andrés Mejía" } },
    { placa: "XYZ98D", servicio: "Alineación y balanceo", cliente: null, asignado: null },
  ];
  const placas = (q: string) => filtrarPatio(patio, q).map((o) => o.placa);

  it("vacío muestra todos", () => {
    expect(placas("  ")).toEqual(["ABC123", "XYZ98D"]);
  });

  it("la placa se encuentra con espacio, guion o minúsculas", () => {
    expect(placas("abc 12")).toEqual(["ABC123"]);
    expect(placas("XYZ-98")).toEqual(["XYZ98D"]);
  });

  it("también por servicio, cliente o quién lo atiende, sin tildes", () => {
    expect(placas("alineacion")).toEqual(["XYZ98D"]);
    expect(placas("ruben")).toEqual(["ABC123"]);
    expect(placas("andres")).toEqual(["ABC123"]);
    expect(placas("frenos")).toEqual([]);
  });
});

describe("primerNombre", () => {
  it("toma la primera palabra y tolera vacíos", () => {
    expect(primerNombre("  Juan  Pérez ")).toBe("Juan");
    expect(primerNombre(null)).toBe("");
  });
});
