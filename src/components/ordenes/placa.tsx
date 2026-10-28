import { formatearPlaca } from "@/lib/placa";
import { cn } from "@/lib/utils";

/** La placa como se ve en el vehículo: fondo amarillo, letras gruesas y separadas. */
export function Placa({ placa, grande = false, className }: { placa: string; grande?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-oro font-bold uppercase leading-none tracking-wider text-tinta",
        grande ? "px-3 py-2 text-3xl" : "px-2 py-1 text-lg",
        className
      )}
    >
      {formatearPlaca(placa)}
    </span>
  );
}
