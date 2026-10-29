import { describe, expect, it } from "vitest";
import { SCRIPT_TEMA } from "./tema";

/** Corre el script de <head> con un almacenamiento y una página de mentira. */
function correr(guardado: string | null | "falla") {
  const meta = { content: "", setAttribute(nombre: string, valor: string) { if (nombre === "content") this.content = valor; } };
  const raiz = { dataset: {} as Record<string, string> };
  const documento = {
    documentElement: raiz,
    querySelectorAll: () => [meta],
    addEventListener: () => {},
  };
  const almacen = {
    getItem: () => {
      if (guardado === "falla") throw new Error("sin almacenamiento");
      return guardado;
    },
  };
  new Function("localStorage", "document", SCRIPT_TEMA)(almacen, documento);
  return { tema: raiz.dataset.tema, color: meta.content };
}

describe("SCRIPT_TEMA", () => {
  it("sin tema elegido no toca nada: manda el modo del celular", () => {
    expect(correr(null)).toEqual({ tema: undefined, color: "" });
  });

  it("pone el tema elegido y el color de la barra del navegador", () => {
    expect(correr("oscuro")).toEqual({ tema: "oscuro", color: "#111113" });
    expect(correr("claro")).toEqual({ tema: "claro", color: "#f9f9f6" });
  });

  it("ignora un valor raro y no se cae si el navegador no deja leer", () => {
    expect(correr("morado").tema).toBeUndefined();
    expect(correr("falla").tema).toBeUndefined();
  });
});
