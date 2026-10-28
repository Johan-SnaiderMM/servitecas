/**
 * Lo que devuelven las funciones de órdenes (migración 0006). Solo tipos: los pueden importar componentes
 * `"use client"`.
 */
import type { Estado } from "@/lib/ordenes";
import type { TipoVehiculo } from "@/lib/placa";
import type { HallazgoOrden, HallazgoPublico } from "./hallazgos";
import type { MensajeOrden, MensajePublico } from "./mensajes";

export type Asignado = { user_id: string; nombre: string } | null;

/** Una fila de `listar_ordenes`. */
export type OrdenEnPatio = {
  id: string;
  numero: number;
  placa: string;
  tipo: TipoVehiculo;
  servicio: string;
  estado: Estado;
  estado_desde: string;
  created_at: string;
  cliente: string | null;
  asignado: Asignado;
  /** Asignada a quien mira. */
  mia: boolean;
  /** Hallazgos esperando la respuesta del cliente, y autorizados. */
  hallazgos_pendientes: number;
  hallazgos_autorizados: number;
  /** Mensajes del cliente que nadie del taller ha visto. */
  mensajes_sin_leer: number;
};

export type Patio = { abiertas: OrdenEnPatio[]; entregadas_hoy: number };

export type EventoOrden = {
  tipo: "creada" | "estado" | "asignacion" | "cancelada" | "hallazgo" | "respuesta";
  estado: Estado | null;
  detalle: string | null;
  autor: string | null;
  at: string;
};

/** Una foto de la orden: se pide por id (la ruta del archivo nunca sale de la app). */
export type FotoOrden = { id: string; tipo: "ingreso" | "hallazgo"; autor: string | null; at: string };

/** Lo que devuelve `obtener_orden`. */
export type OrdenDetalle = {
  id: string;
  numero: number;
  token: string;
  servicio: string;
  kilometraje: number | null;
  estado: Estado;
  estado_desde: string;
  created_at: string;
  entregado_at: string | null;
  cancelada_at: string | null;
  motivo_cancelacion: string | null;
  vehiculo: { placa: string; tipo: TipoVehiculo };
  cliente: { nombre: string | null; celular: string };
  asignado: Asignado;
  mia: boolean;
  fotos: FotoOrden[];
  hallazgos: HallazgoOrden[];
  /** Los últimos 100, del más viejo al más nuevo. */
  mensajes: MensajeOrden[];
  eventos: EventoOrden[];
};

/** Lo que devuelve `buscar_vehiculo` mientras se escribe la placa. */
export type VehiculoConocido =
  | { existe: false; placa?: string }
  | {
      existe: true;
      placa: string;
      tipo: TipoVehiculo;
      cliente: { nombre: string | null; celular: string };
      visitas: number;
      orden_abierta: { id: string; numero: number; estado: Estado } | null;
    };

/** Una fila de `listar_jefes_patio`. */
export type JefePatio = { user_id: string; nombre: string; yo: boolean; abiertas: number };

/** Lo que devuelve `publico_orden` (el enlace del cliente). */
export type OrdenPublica =
  | { existe: false }
  | {
      existe: true;
      taller: { nombre: string; whatsapp: string | null; direccion: string | null };
      orden: {
        numero: number;
        placa: string;
        tipo: TipoVehiculo;
        servicio: string;
        estado: Estado;
        estado_desde: string;
        created_at: string;
        entregado_at: string | null;
        cliente: string | null;
        atiende: string | null;
        fotos: { id: string; tipo: "ingreso"; at: string }[];
        hallazgos: HallazgoPublico[];
        mensajes: MensajePublico[];
        historia: { estado: Estado; at: string }[];
      };
    };
