import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Acciones principales de la pantalla, ABAJO y al alcance del pulgar. En las pantallas con barra de navegación
 * (`conNavegacion`) queda justo encima de ella; en las de una sola tarea, pegada al borde de la pantalla.
 * Con `fila` los botones van lado a lado (dos acciones iguales); si no, uno debajo de otro.
 * La página que la use deja espacio suficiente al final de su contenido (≈ 7 rem) para que nada quede tapado.
 */
export function BarraAccion({
  children,
  conNavegacion = false,
  fila = false,
}: {
  children: ReactNode;
  conNavegacion?: boolean;
  fila?: boolean;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 z-10 border-t border-linea bg-papel/90 px-4 pt-3 backdrop-blur",
        conNavegacion
          ? "bottom-[calc(4rem+1px+env(safe-area-inset-bottom,0px))] pb-3"
          : "bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      )}
    >
      <div className={cn("mx-auto max-w-md gap-2", fila ? "flex flex-row [&>*]:flex-1" : "flex flex-col")}>{children}</div>
    </div>
  );
}
