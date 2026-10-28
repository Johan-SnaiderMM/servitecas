/**
 * Contraste de la paleta (WCAG 2.x): los pares de color que la app usa de verdad, calculados con la fórmula, no a ojo.
 * Si cambias un token de `globals.css` o un color de foco, de borde o de texto de ejemplo, esto avisa si deja de leerse.
 * Un jefe de patio mira el celular al sol: el gris claro no sirve.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (...partes: string[]) => fs.readFileSync(path.join(process.cwd(), ...partes), "utf8").replace(/\r\n/g, "\n");

const tokens = Object.fromEntries(
  [...leer("src", "app", "globals.css").matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]])
);
const BLANCO = "#ffffff";

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

describe("la paleta de globals.css", () => {
  it("trae los tokens que usa la app", () => {
    for (const t of ["tinta", "tinta-2", "papel", "hueso", "linea", "borde-campo", "oro", "rojo", "verde", "azul"]) {
      expect(tokens[t], t).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("calcula bien: negro sobre blanco es 21:1 y #777 sobre blanco no llega a 4,5", () => {
    expect(contraste("#000000", BLANCO)).toBeCloseTo(21, 5);
    expect(contraste("#777777", BLANCO)).toBeLessThan(4.5);
  });

  it("el texto llega a AA (4,5:1) sobre cada fondo donde se usa", () => {
    for (const f of [BLANCO, tokens.papel, tokens.hueso]) {
      expect(contraste(tokens.tinta, f), `tinta sobre ${f}`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(tokens["tinta-2"], f), `tinta-2 sobre ${f}`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(tokens.rojo, f), `rojo sobre ${f}`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(tokens.azul, f), `azul sobre ${f}`).toBeGreaterThanOrEqual(4.5);
    }
    // El verde («Autorizado», «Listo para entregar») va sobre blanco y papel.
    for (const f of [BLANCO, tokens.papel]) expect(contraste(tokens.verde, f), `verde sobre ${f}`).toBeGreaterThanOrEqual(4.5);
  });

  it("el texto blanco de los botones llega a AA sobre tinta, rojo y verde", () => {
    expect(contraste(BLANCO, tokens.tinta)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(BLANCO, tokens.rojo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(BLANCO, tokens.verde)).toBeGreaterThanOrEqual(4.5);
  });

  it("la placa (tinta sobre oro) se lee", () => {
    expect(contraste(tokens.tinta, tokens.oro)).toBeGreaterThanOrEqual(4.5);
  });

  it("el borde de los campos y el anillo de foco llegan a 3:1 sobre blanco y sobre papel", () => {
    for (const f of [BLANCO, tokens.papel]) {
      expect(contraste(tokens["borde-campo"], f), `borde-campo sobre ${f}`).toBeGreaterThanOrEqual(3);
      expect(contraste(tokens.tinta, f), `foco (tinta) sobre ${f}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("las clases que no deben volver", () => {
  const fuentes: [string, string][] = [];
  (function recorrer(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (/\.(tsx|css)$/.test(e.name)) fuentes.push([ruta, fs.readFileSync(ruta, "utf8")]);
    }
  })(path.join(process.cwd(), "src"));

  it("ningún anillo de foco ni texto de ejemplo en zinc-400 (2,5:1), ni campos sueltos con el borde tenue", () => {
    for (const [ruta, codigo] of fuentes) {
      expect(codigo, ruta).not.toMatch(/focus-visible:(outline|ring|border)-zinc-400|placeholder:text-zinc-400/);
      // Los campos van con <Input>, <AreaTexto> o <Selector> (components/ui/input.tsx), que traen `borde-campo`.
      if (!ruta.endsWith(path.join("ui", "input.tsx"))) expect(codigo, ruta).not.toMatch(/<(textarea|select)\b/);
    }
  });

  it("nada de letra de 12 px (`text-xs`) ni del guion largo en el texto de la app", () => {
    for (const [ruta, codigo] of fuentes) {
      expect(codigo, ruta).not.toMatch(/text-xs/);
      expect(codigo, ruta).not.toContain("—");
    }
  });
});
