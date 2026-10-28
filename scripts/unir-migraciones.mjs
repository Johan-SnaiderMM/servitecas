// Une las migraciones numeradas en UN solo archivo para pegarlo en Supabase > SQL Editor.
// Uso: npm run esquema   (una prueba falla si supabase/esquema-completo.sql no está al día)
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DIR = path.join(process.cwd(), "supabase", "migrations");
export const SALIDA = path.join(process.cwd(), "supabase", "esquema-completo.sql");

export async function construir() {
  const archivos = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const partes = [
    "-- =====================================================================\n" +
      "-- SERVITECAS · ESQUEMA COMPLETO (generado con `npm run esquema`; NO editar a mano)\n" +
      "-- Es la unión de supabase/migrations/*.sql en orden. Pégalo completo en Supabase > SQL Editor.\n" +
      "-- =====================================================================\n",
  ];
  for (const archivo of archivos) {
    const sql = (await readFile(path.join(DIR, archivo), "utf8")).replace(/\r\n/g, "\n");
    partes.push(`\n-- >>>>>>>>>> ${archivo} >>>>>>>>>>\n${sql.trimEnd()}\n`);
  }
  return partes.join("");
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  await writeFile(SALIDA, await construir());
  console.log("✓ supabase/esquema-completo.sql");
}
