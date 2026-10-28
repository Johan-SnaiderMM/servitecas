"use server";

import { revalidatePath } from "next/cache";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaFilasImportar } from "@/lib/esquemas/importar";
import type { FilaLista } from "@/lib/importar-clientes";
import type { ResultadoImportar } from "@/lib/tipos/importar";

/**
 * Carga de clientes. Con `guardar` en false es la vista previa: la base hace todo y lo deshace, y devuelve cuántos
 * clientes y vehículos se crearían. Con true, guarda. Las filas ya vienen revisadas del celular; la base decide.
 */
export async function importarClientes(filas: FilaLista[], guardar: boolean): Promise<Resultado<ResultadoImportar>> {
  const parsed = esquemaFilasImportar.safeParse(filas);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el archivo." };

  const r = await ejecutar<ResultadoImportar>("importar_clientes", { p_filas: parsed.data, p_guardar: guardar === true });
  if (r.ok && guardar) revalidatePath("/inicio");
  return r;
}
