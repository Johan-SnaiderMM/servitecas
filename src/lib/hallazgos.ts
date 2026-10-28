/**
 * Hallazgos (migración 0008): categorías del catálogo (idénticas a `fn_categorias_hallazgo()`, una prueba las compara),
 * estados y el mensaje de WhatsApp que pide la autorización. Módulo puro: lo usan componentes `"use client"`.
 */
import { formatearPesos } from "./dinero";
import { formatearPlaca } from "./placa";

export const CATEGORIAS = ["llantas", "direccion", "frenos", "suspension", "motor", "electrico", "otros"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  llantas: "Llantas",
  direccion: "Alineación y dirección",
  frenos: "Frenos",
  suspension: "Suspensión",
  motor: "Motor y aceite",
  electrico: "Eléctrico",
  otros: "Otros",
};

export function esCategoria(valor: unknown): valor is Categoria {
  return typeof valor === "string" && (CATEGORIAS as readonly string[]).includes(valor);
}

export type EstadoHallazgo = "pendiente" | "autorizado" | "rechazado" | "anulado";

/** Lo que ve el personal. */
export const ETIQUETA_HALLAZGO: Record<EstadoHallazgo, string> = {
  pendiente: "Esperando al cliente",
  autorizado: "Autorizado",
  rechazado: "No autorizado",
  anulado: "Anulado",
};

/** Hasta cuántas fotos lleva un hallazgo (la base pone el mismo tope). */
export const MAX_FOTOS_HALLAZGO = 3;

/** "$ 180.000" o, sin precio, lo que se le dice al cliente. */
export function textoPrecio(precio: number | null): string {
  return precio === null ? "Te confirmamos el valor" : formatearPesos(precio);
}

/**
 * El mensaje que pide la autorización por WhatsApp: qué se encontró, por qué importa, cuánto vale y el enlace donde
 * el cliente ve la foto y responde con un toque.
 */
export function mensajeHallazgo(d: {
  cliente: string | null;
  placa: string;
  titulo: string;
  descripcion: string;
  precio: number | null;
  enlace: string;
}): string {
  const nombre = (d.cliente ?? "").trim().split(/\s+/)[0] ?? "";
  const lineas = [
    `Hola${nombre ? ` ${nombre}` : ""}, revisando tu vehículo ${formatearPlaca(d.placa)} encontramos: *${d.titulo}*.`,
    d.descripcion,
    d.precio === null ? "Te confirmamos el valor." : `Valor: ${formatearPesos(d.precio)}.`,
    `Mira la foto y autoriza aquí: ${d.enlace}`,
  ];
  return lineas.join("\n");
}
