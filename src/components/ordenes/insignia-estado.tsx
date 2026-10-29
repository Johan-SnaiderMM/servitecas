import { ETIQUETA_ESTADO, type Estado } from "@/lib/ordenes";
import { cn } from "@/lib/utils";

const COLOR: Record<Estado, string> = {
  recibido: "border-linea bg-superficie text-tinta",
  diagnostico: "border-azul bg-superficie text-azul",
  en_proceso: "border-oro bg-superficie text-tinta",
  listo: "border-verde bg-superficie text-verde",
  entregado: "border-linea bg-hueso text-tinta-2",
  cancelada: "border-rojo bg-superficie text-rojo",
};

/** El estado de una orden como etiqueta: borde y letra del color del estado, nunca relleno fuerte. */
export function InsigniaEstado({ estado, className }: { estado: Estado; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium leading-tight",
        COLOR[estado],
        className
      )}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}
