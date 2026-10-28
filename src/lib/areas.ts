/**
 * Áreas de permiso de un taller. Es la ÚNICA lista en TypeScript y debe ser idéntica a `fn_areas()` en SQL
 * (migración 0003): una prueba (src/test/permisos-por-area.test.ts) las compara.
 *
 *   recepcion   registrar vehículos, abrir órdenes y ver todas las órdenes
 *   patio       trabajar los vehículos: estados, fotos, hallazgos y mensajes con el cliente
 *   clientes    ver los clientes y cargarlos desde un archivo
 *   catalogo    la lista de hallazgos del taller
 *   resumen     el resumen de hallazgos autorizados y tiempos
 *   equipo      invitar personas y asignarles roles
 *   ajustes     los datos del taller (nombre, WhatsApp, dirección)
 *
 * Quién es quién lo decide la base (RLS y `requerir_area`); esto solo sirve para ESCONDER botones y pantallas.
 * Este módulo no importa nada del servidor: lo pueden usar componentes `"use client"`.
 */
import type { Contexto } from "@/lib/contexto";

export const AREAS = ["recepcion", "patio", "clientes", "catalogo", "resumen", "equipo", "ajustes"] as const;

export type Area = (typeof AREAS)[number];

/** Nombre corto para mostrar en la pantalla de equipo. */
export const ETIQUETA_AREA: Record<Area, string> = {
  recepcion: "Registrar vehículos",
  patio: "Trabajar en el patio",
  clientes: "Clientes",
  catalogo: "Lista de hallazgos",
  resumen: "Resumen",
  equipo: "Equipo",
  ajustes: "Datos del taller",
};

export function esArea(valor: unknown): valor is Area {
  return typeof valor === "string" && (AREAS as readonly string[]).includes(valor);
}

/** ¿Alguna de las `pedidas` está entre las áreas de la persona? (misma semántica que `tiene_area` en SQL). */
export function abre(areas: readonly string[] | null | undefined, ...pedidas: Area[]): boolean {
  if (!areas || areas.length === 0) return false;
  return pedidas.some((a) => areas.includes(a));
}

// ---------------------------------------------------------------------
// Pantallas del personal
// ---------------------------------------------------------------------

/**
 * Pantallas del personal y qué áreas abren cada una (basta con abrir ALGUNA). `null` = cualquier persona del
 * taller. Una pantalla nueva se agrega aquí y su `page.tsx` empieza con `revisarPermiso("<pantalla>")`
 * (una prueba lo exige para cada página).
 */
export const PANTALLAS = {
  inicio: null,
  mas: null,
  equipo: ["equipo"],
  // Ver y trabajar las órdenes del patio.
  ordenes: ["recepcion", "patio"],
  // Recibir un vehículo (abrir la orden).
  recibir: ["recepcion"],
  // Registrar un hallazgo en una orden.
  hallazgo: ["patio"],
  // La lista de hallazgos del taller.
  catalogo: ["catalogo"],
  // Cargar los clientes del taller desde un archivo.
  clientes: ["clientes"],
  // Cifras del periodo: hallazgos autorizados, vehículos y tiempos.
  resumen: ["resumen"],
} as const satisfies Record<string, readonly Area[] | null>;

export type Pantalla = keyof typeof PANTALLAS;

/** Quién entra, ya resuelto a partir del contexto de la base. */
export type Quien = {
  nombre: string;
  esDueno: boolean;
  areas: readonly Area[];
  roles: readonly string[];
};

/** null si la sesión no pertenece a ningún taller (todavía no tiene perfil). */
export function quienEs(contexto: Contexto): Quien | null {
  const p = contexto.perfil;
  if (!p) return null;
  return { nombre: p.nombre, esDueno: p.rol === "dueno", areas: p.areas, roles: p.roles };
}

/** ¿Esta persona puede ver esta pantalla? La base igual rechaza lo que no le toca: esto evita pantallas a medias. */
export function puedeVer(quien: Pick<Quien, "areas">, pantalla: Pantalla): boolean {
  const requeridas = PANTALLAS[pantalla] as readonly Area[] | null;
  if (requeridas === null) return true;
  return abre(quien.areas, ...requeridas);
}
