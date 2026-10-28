import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Encabezado de una pantalla de UNA tarea (sin barra de abajo): flecha para volver y el título. */
export function EncabezadoTarea({ titulo, volverA }: { titulo: string; volverA: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-linea bg-papel/90 px-2 backdrop-blur pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))]">
      <Link
        href={volverA}
        aria-label="Volver"
        className="flex size-12 shrink-0 items-center justify-center rounded-xl active:bg-hueso"
      >
        <ArrowLeft className="size-6" aria-hidden />
      </Link>
      <h1 className="text-xl font-semibold tracking-tight leading-tight">{titulo}</h1>
    </header>
  );
}
