import type { Area } from "@/lib/areas";

/**
 * Lo que devuelve `obtener_contexto()` (migraciones 0003 y 0011): el taller de quien entra y su perfil con las áreas que abre.
 * Solo tipos: lo pueden importar componentes `"use client"`.
 */
export type Contexto = {
  taller: {
    id: string;
    nombre: string;
    slug: string;
    es_demo: boolean;
    /** La demo pide PIN para reiniciarse (nunca se sabe cuál). */
    reinicio_con_pin: boolean;
    whatsapp: string | null;
    direccion: string | null;
  } | null;
  perfil: {
    nombre: string;
    rol: "dueno" | "equipo";
    areas: Area[];
    roles: string[];
  } | null;
};
