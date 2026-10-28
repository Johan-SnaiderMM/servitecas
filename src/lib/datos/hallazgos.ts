import "server-only";
import type { ItemCatalogo } from "@/lib/tipos/hallazgos";
import { consultar } from "./llamar";

/** La lista de hallazgos del taller (con `todos`, también los archivados). */
export function listarCatalogo(todos = false): Promise<ItemCatalogo[]> {
  return consultar<ItemCatalogo[]>("listar_catalogo", { p_todos: todos });
}
