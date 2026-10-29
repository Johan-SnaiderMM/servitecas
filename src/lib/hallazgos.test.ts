import { describe, expect, it } from "vitest";
import {
  CATEGORIAS,
  contarPorCategoria,
  ETIQUETA_CATEGORIA,
  ETIQUETA_HALLAZGO,
  esCategoria,
  filtrarCatalogo,
  mensajeHallazgo,
  textoPrecio,
} from "./hallazgos";
import { textoPlano } from "./texto";

describe("filtrarCatalogo", () => {
  const items = [
    { nombre: "Pastillas de freno gastadas", descripcion: "Frenan menos.", categoria: "frenos" as const },
    { nombre: "Disco rayado", descripcion: "Vibra al frenar.", categoria: "frenos" as const },
    { nombre: "Batería débil", descripcion: "Puede no prender.", categoria: "electrico" as const },
    { nombre: "Llanta lisa", descripcion: "Sin labrado.", categoria: "llantas" as const },
  ];

  it("sin búsqueda ni categoría no muestra nada: nunca la lista entera", () => {
    expect(filtrarCatalogo(items, { categoria: null, busqueda: "  " })).toEqual([]);
  });

  it("con categoría muestra solo esa", () => {
    expect(filtrarCatalogo(items, { categoria: "frenos", busqueda: "" }).map((i) => i.nombre)).toEqual([
      "Pastillas de freno gastadas",
      "Disco rayado",
    ]);
  });

  it("la búsqueda ignora tildes y mayúsculas, busca en todas y también por el nombre de la categoría", () => {
    expect(filtrarCatalogo(items, { categoria: "llantas", busqueda: "BATERIA" }).map((i) => i.nombre)).toEqual(["Batería débil"]);
    expect(filtrarCatalogo(items, { categoria: null, busqueda: "eléctrico" }).map((i) => i.nombre)).toEqual(["Batería débil"]);
    expect(filtrarCatalogo(items, { categoria: null, busqueda: "frenar" }).map((i) => i.nombre)).toEqual(["Disco rayado"]);
  });

  it("textoPlano quita tildes y mayúsculas", () => {
    expect(textoPlano("Alineación Y Dirección")).toBe("alineacion y direccion");
  });

  it("contarPorCategoria cuenta en el orden de CATEGORIAS y omite las vacías", () => {
    expect(contarPorCategoria(items)).toEqual([
      { categoria: "llantas", n: 1 },
      { categoria: "frenos", n: 2 },
      { categoria: "electrico", n: 1 },
    ]);
  });
});

describe("categorías", () => {
  it("toda categoría tiene su etiqueta y no hay repetidas", () => {
    expect(Object.keys(ETIQUETA_CATEGORIA).sort()).toEqual([...CATEGORIAS].sort());
    expect(new Set(CATEGORIAS).size).toBe(CATEGORIAS.length);
  });

  it("esCategoria distingue lo válido", () => {
    expect(esCategoria("frenos")).toBe(true);
    expect(esCategoria("carroceria")).toBe(false);
  });

  it("todos los estados tienen etiqueta", () => {
    expect(Object.keys(ETIQUETA_HALLAZGO).sort()).toEqual(["anulado", "autorizado", "pendiente", "rechazado"]);
  });
});

describe("mensajeHallazgo", () => {
  const base = {
    cliente: "Juan Pérez",
    placa: "ABC123",
    titulo: "Pastillas de freno delanteras gastadas",
    descripcion: "Las pastillas están por debajo del mínimo: el carro tarda más en frenar.",
    precio: 180000,
    enlace: "https://x.co/o/abc",
  };

  it("saluda, dice qué se encontró, por qué, cuánto vale y lleva el enlace", () => {
    const m = mensajeHallazgo(base);
    expect(m).toContain("Hola Juan, revisando tu vehículo ABC 123 encontramos: *Pastillas de freno delanteras gastadas*.");
    expect(m).toContain(base.descripcion);
    expect(m).toContain("Valor: $ 180.000.");
    expect(m).toContain(`autoriza aquí: ${base.enlace}`);
  });

  it("sin precio promete confirmarlo; sin nombre saluda igual", () => {
    const m = mensajeHallazgo({ ...base, cliente: null, precio: null });
    expect(m.startsWith("Hola, revisando")).toBe(true);
    expect(m).toContain("Te confirmamos el valor.");
    expect(textoPrecio(null)).toBe("Te confirmamos el valor");
    expect(textoPrecio(0)).toBe("$ 0");
  });
});
