/**
 * El navegador NUNCA habla con Supabase: la URL y la anon key son variables del servidor (sin NEXT_PUBLIC_, que Next
 * metería en el código que baja al celular). Varias protecciones dependen de eso: sin la llave nadie puede llamar
 * `publico_tomar_aviso` por su cuenta (devuelve los avisos push del personal) ni cambiar la contraseña de la cuenta de
 * la demo con su sesión. Si algún día un componente del navegador necesita Supabase, hay que revisar esas dos cosas
 * antes de exponer la llave.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta);
    return /\.(ts|tsx|mjs|js)$/.test(e.name) ? [ruta] : [];
  });
}

const fuentes = [...archivos(path.join(RAIZ, "src")), path.join(RAIZ, "next.config.ts")].filter(
  (f) => !f.endsWith("llaves-solo-servidor.test.ts")
);
const leer = (f: string) => fs.readFileSync(f, "utf8");

describe("Supabase solo desde el servidor", () => {
  it("ninguna variable de Supabase lleva NEXT_PUBLIC_", () => {
    expect(fuentes.filter((f) => /NEXT_PUBLIC_SUPABASE/.test(leer(f))).map((f) => path.relative(RAIZ, f))).toEqual([]);
    expect(leer(path.join(RAIZ, ".env.example"))).not.toMatch(/NEXT_PUBLIC_SUPABASE/);
  });

  it("ningún componente del navegador importa Supabase", () => {
    const delNavegador = fuentes.filter((f) => /^\s*["']use client["']/.test(leer(f)));
    expect(delNavegador.length).toBeGreaterThan(0);
    expect(delNavegador.filter((f) => /@supabase\//.test(leer(f))).map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  it("la CSP no deja que el navegador se conecte a Supabase", () => {
    expect(leer(path.join(RAIZ, "next.config.ts"))).not.toMatch(/supabase\.co/);
  });
});
