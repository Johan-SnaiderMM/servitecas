/**
 * Toda página del personal empieza con `revisarPermiso("<pantalla>")` y esa pantalla existe en PANTALLAS
 * (src/lib/areas.ts). Una pantalla nueva sin esa revisión mostraría datos a quien no le toca (la base igual
 * rechaza, pero la pantalla quedaría a medias).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PANTALLAS } from "@/lib/areas";

const RAIZ = path.join(process.cwd(), "src", "app");

/**
 * Páginas que NO son del personal: la raíz (solo redirige), la entrada (a donde se manda a quien no tiene sesión),
 * /unirme (donde alguien sin cuenta canjea su código de invitación) y el enlace del cliente /o/<token> (sin cuenta:
 * solo ejecuta funciones publico_*; una prueba fija cuáles).
 */
const EXENTAS = new Set([
  "page.tsx",
  path.join("entrar", "page.tsx"),
  path.join("unirme", "page.tsx"),
  path.join("o", "[token]", "page.tsx"),
]);

function paginas(dir: string, base = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(base, e.name);
    if (e.isDirectory()) return paginas(path.join(dir, e.name), rel);
    return e.name === "page.tsx" ? [rel] : [];
  });
}

describe("pantallas del personal", () => {
  const delPersonal = paginas(RAIZ).filter((p) => !EXENTAS.has(p));

  it("hay al menos una pantalla del personal que revisar", () => {
    expect(delPersonal.length).toBeGreaterThan(0);
  });

  it.each(delPersonal)("%s llama a revisarPermiso con una pantalla conocida", (pagina) => {
    const texto = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
    const llamada = texto.match(/revisarPermiso\(\s*"([a-z_]+)"\s*\)/);
    expect(llamada, `${pagina} debe empezar con revisarPermiso("<pantalla>")`).not.toBeNull();
    expect(Object.keys(PANTALLAS)).toContain(llamada![1]);
  });

  it("cada página que llama a revisarPermiso también maneja el caso sin permiso", () => {
    for (const pagina of delPersonal) {
      const texto = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
      expect(texto, `${pagina} debe mostrar <SinPermiso> cuando no hay permiso`).toMatch(/permitido/);
      expect(texto).toMatch(/SinPermiso/);
    }
  });
});
