import { cn } from "@/lib/utils";

/** Un mensaje ya listo para pintar: quien mira decide cuáles son "suyos" (a la derecha). */
export type Burbuja = {
  id: string;
  propio: boolean;
  texto: string;
  /** "Juan · 9:40 a. m." */
  pie: string;
  /** Lo del cliente que el taller todavía no ve. */
  nuevo?: boolean;
};

/** El hilo de mensajes de una orden, del más viejo al más nuevo. Sirve igual al cliente y al taller. */
export function HiloMensajes({ burbujas }: { burbujas: Burbuja[] }) {
  return (
    <ol className="space-y-2">
      {burbujas.map((b) => (
        <li key={b.id} className={cn("flex", b.propio ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[85%] rounded-2xl border px-3 py-2",
              b.propio ? "border-linea bg-hueso" : "border-linea bg-white",
              b.nuevo && "border-oro"
            )}
          >
            <p className="whitespace-pre-wrap break-words text-base leading-snug">{b.texto}</p>
            <p className="mt-1 text-base text-tinta-2">
              {b.nuevo && <span className="font-semibold text-tinta">Nuevo · </span>}
              {b.pie}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
