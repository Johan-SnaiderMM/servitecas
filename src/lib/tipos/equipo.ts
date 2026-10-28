/**
 * Lo que devuelve `listar_equipo()` (migración 0005). Solo tipos: los pueden importar componentes `"use client"`.
 */
import type { Area } from "@/lib/areas";

export type RolEquipo = { id: string; nombre: string; areas: Area[]; personas: number };

export type PersonaEquipo = {
  user_id: string;
  nombre: string;
  rol: "dueno" | "equipo";
  /** true = es quien está mirando la pantalla. */
  yo: boolean;
  /** Ids de roles. */
  roles: string[];
  areas: Area[];
};

export type InvitacionPendiente = {
  id: string;
  nombre: string;
  /** Sin guion (K7MP2XQ9); se muestra con `formatearCodigo`. */
  codigo: string;
  expira_at: string;
  roles: string[];
};

export type EquipoListado = {
  areas: Area[];
  roles: RolEquipo[];
  personas: PersonaEquipo[];
  invitaciones: InvitacionPendiente[];
};
