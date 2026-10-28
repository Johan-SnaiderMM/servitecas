import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variante = "primario" | "secundario" | "fantasma" | "peligro";
type Tamano = "md" | "lg";

type Opciones = { variante?: Variante; tamano?: Tamano; bloque?: boolean };

/**
 * Clases de un botón. Objetivos táctiles ≥ 48 px (`md`) o 56 px (`lg`), sin `hover`. Lo apagado se ve con borde
 * punteado, fondo hueso y texto legible: nunca con `opacity`.
 */
export function botonVariantes({ variante = "primario", tamano = "md", bloque = false }: Opciones = {}): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl border px-4 font-medium leading-tight select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta",
    "disabled:border-dashed disabled:border-zinc-300 disabled:bg-hueso disabled:text-tinta-2",
    tamano === "lg" ? "min-h-14 text-base" : "min-h-12 text-base",
    bloque && "w-full",
    variante === "primario" && "border-tinta bg-tinta text-white active:bg-zinc-700",
    variante === "secundario" && "border-linea bg-white text-tinta active:bg-hueso",
    variante === "fantasma" && "border-transparent bg-transparent text-tinta-2 underline underline-offset-4 active:bg-hueso",
    variante === "peligro" && "border-rojo bg-rojo text-white active:bg-red-800"
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & Opciones;

export function Button({ variante, tamano, bloque, className, type = "button", ...resto }: Props) {
  return <button type={type} className={cn(botonVariantes({ variante, tamano, bloque }), className)} {...resto} />;
}
