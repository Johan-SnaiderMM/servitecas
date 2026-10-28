/**
 * Lo que devuelven las funciones de hallazgos (migración 0008). Solo tipos: los pueden importar componentes
 * `"use client"`.
 */
import type { Categoria, EstadoHallazgo } from "@/lib/hallazgos";

/** Una fila de `listar_catalogo`. */
export type ItemCatalogo = {
  id: string;
  categoria: Categoria;
  nombre: string;
  descripcion: string;
  precio_sugerido: number | null;
  activo: boolean;
};

/** Un hallazgo dentro de `obtener_orden`. */
export type HallazgoOrden = {
  id: string;
  titulo: string;
  descripcion: string;
  precio: number | null;
  estado: EstadoHallazgo;
  respondido_at: string | null;
  canal: "enlace" | "telefono" | null;
  autor_respuesta: string | null;
  motivo_anulacion: string | null;
  autor: string | null;
  at: string;
  /** Ids de sus fotos (se sirven por /api/foto/orden/<id>). */
  fotos: string[];
};

/** Un hallazgo dentro de `publico_orden` (sin quién lo registró ni los anulados). */
export type HallazgoPublico = {
  id: string;
  titulo: string;
  descripcion: string;
  precio: number | null;
  estado: Exclude<EstadoHallazgo, "anulado">;
  respondido_at: string | null;
  canal: "enlace" | "telefono" | null;
  fotos: string[];
};
