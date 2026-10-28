import { CarFront } from "lucide-react";
import { MARCA } from "@/lib/marca";

/** La marca arriba de las pantallas de entrada: ícono y nombre. */
export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-10 items-center justify-center rounded-lg border border-linea bg-oro">
        <CarFront className="size-6" aria-hidden />
      </span>
      <span className="text-2xl font-semibold leading-none tracking-tight">{MARCA.nombre}</span>
    </div>
  );
}
