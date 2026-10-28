import "server-only";
import type { Resumen } from "@/lib/tipos/resumen";
import { consultar } from "./llamar";

/** El resumen del taller entre dos días de Bogotá ('YYYY-MM-DD', inclusive). */
export function obtenerResumen(desde: string, hasta: string): Promise<Resumen> {
  return consultar<Resumen>("obtener_resumen", { p_desde: desde, p_hasta: hasta });
}
