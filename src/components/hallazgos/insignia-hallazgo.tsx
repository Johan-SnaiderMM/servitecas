import { ETIQUETA_HALLAZGO, type EstadoHallazgo } from "@/lib/hallazgos";
import { cn } from "@/lib/utils";

const COLOR: Record<EstadoHallazgo, string> = {
  pendiente: "border-oro bg-superficie text-tinta",
  autorizado: "border-verde bg-superficie text-verde",
  rechazado: "border-rojo bg-superficie text-rojo",
  anulado: "border-dashed border-zinc-300 bg-hueso text-tinta-2",
};

/** El estado de un hallazgo como etiqueta (borde y letra del color del estado). */
export function InsigniaHallazgo({ estado, className }: { estado: EstadoHallazgo; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium leading-tight",
        COLOR[estado],
        className
      )}
    >
      {ETIQUETA_HALLAZGO[estado]}
    </span>
  );
}
