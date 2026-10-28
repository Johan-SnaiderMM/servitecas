import "server-only";
import type { EquipoListado } from "@/lib/tipos/equipo";
import { consultar } from "./llamar";

/** Roles, personas e invitaciones pendientes. Solo para quien administra el equipo (la base lo exige). */
export function listarEquipo(): Promise<EquipoListado> {
  return consultar<EquipoListado>("listar_equipo");
}
