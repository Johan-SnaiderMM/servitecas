/**
 * Pantallas de carga y de error (como en Barberías). Las de carga van SOLO en las pantallas del personal: en el enlace
 * del cliente, `loading.tsx` hace que el servidor responda 200 antes de saber si la orden existe, y el 404 de un enlace
 * que no existe se pierde.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const app = (...partes: string[]) => path.join(process.cwd(), "src", "app", ...partes);
const hay = (...partes: string[]) => fs.existsSync(app(...partes));

describe("pantallas de carga y de error", () => {
  it("hay carga en las pantallas del personal y error en la raíz y en el diseño raíz", () => {
    expect(hay("(app)", "loading.tsx")).toBe(true);
    expect(hay("(tarea)", "loading.tsx")).toBe(true);
    expect(hay("error.tsx")).toBe(true);
    expect(hay("global-error.tsx")).toBe(true);
  });

  it("no hay `loading.tsx` en la raíz ni en el enlace del cliente (perdería el 404)", () => {
    for (const ruta of [[], ["o"], ["o", "[token]"]]) {
      expect(hay(...ruta, "loading.tsx"), ruta.join("/") || "raíz").toBe(false);
    }
  });

  it("los textos están en español y no muestran el mensaje técnico del error", () => {
    for (const archivo of ["error.tsx", "global-error.tsx"]) {
      const codigo = fs.readFileSync(app(archivo), "utf8");
      expect(codigo, archivo).toContain("Reintentar");
      expect(codigo, archivo).not.toMatch(/\{error\.message\}|Something went wrong/);
    }
  });
});
