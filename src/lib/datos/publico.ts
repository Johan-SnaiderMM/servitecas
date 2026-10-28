import "server-only";
import type { OrdenPublica } from "@/lib/tipos/ordenes";
import { consultarPublico } from "./llamar";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La orden de quien tiene el enlace secreto. Un token que no existe (o no es un uuid) da `{ existe: false }`. */
export async function obtenerOrdenPublica(token: string): Promise<OrdenPublica> {
  // Un texto que no es un uuid ni siquiera llega a la base.
  if (!UUID.test(token)) return { existe: false };
  return consultarPublico<OrdenPublica>("publico_orden", { p_token: token });
}
