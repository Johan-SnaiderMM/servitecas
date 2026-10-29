import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Lo que comparten todos los campos: borde `borde-campo` (3:1, se ve al sol), anillo de foco en `tinta`, texto de ejemplo
 * en `tinta-2` y lo apagado con borde punteado. 16 px de letra: más pequeño, iOS hace zoom al enfocar.
 */
export const CAMPO = cn(
  "w-full rounded-xl border border-borde-campo bg-superficie text-base text-tinta placeholder:text-tinta-2",
  "focus-visible:border-tinta focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-tinta",
  "disabled:border-dashed disabled:border-zinc-300 disabled:bg-hueso"
);

/** Campo de texto de una línea: 48 px de alto. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CAMPO, "min-h-12 px-3", className)} {...props} />;
}

/** Texto de varias líneas (explicaciones, motivos, mensajes). */
export function AreaTexto({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(CAMPO, "p-3", className)} {...props} />;
}

/** Lista para elegir una opción: 48 px de alto. */
export function Selector({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CAMPO, "min-h-12 px-3", className)} {...props} />;
}
