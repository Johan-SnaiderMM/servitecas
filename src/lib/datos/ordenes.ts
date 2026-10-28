import "server-only";
import type { JefePatio, OrdenDetalle, Patio } from "@/lib/tipos/ordenes";
import { consultar } from "./llamar";

/** Las órdenes abiertas del taller y cuántas se entregaron hoy. */
export function listarOrdenes(): Promise<Patio> {
  return consultar<Patio>("listar_ordenes");
}

/** Una orden con su vehículo, su cliente y su historia (lanza ErrorApp si no existe o es de otro taller). */
export function obtenerOrden(id: string): Promise<OrdenDetalle> {
  return consultar<OrdenDetalle>("obtener_orden", { p_id: id });
}

/** Quienes pueden recibir vehículos asignados (abren el área "patio"). */
export function listarJefesPatio(): Promise<JefePatio[]> {
  return consultar<JefePatio[]>("listar_jefes_patio");
}
