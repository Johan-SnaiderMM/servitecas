import Link from "@/components/ui/enlace";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fila grande y tocable que lleva a otra pantalla (título, detalle opcional y flecha). Mínimo 64 px de alto. */
export function EnlaceFila({
  href,
  titulo,
  detalle,
  Icono,
  tenue = false,
}: {
  href: string;
  titulo: string;
  detalle?: string;
  Icono?: LucideIcon;
  /** Estilo apagado (borde punteado y fondo gris): para algo pendiente o incompleto, nunca con opacity. */
  tenue?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 active:bg-hueso",
        tenue ? "border-dashed border-zinc-300 bg-hueso" : "border-linea bg-superficie"
      )}
    >
      {Icono && <Icono className="size-6 shrink-0 text-tinta-2" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium leading-tight">{titulo}</span>
        {detalle && <span className="mt-0.5 block text-base text-tinta-2">{detalle}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-tinta-2" aria-hidden />
    </Link>
  );
}
