import Link from "next/link";
import { Lock } from "lucide-react";
import { botonVariantes } from "@/components/ui/button";

/** Lo que ve alguien que abre una pantalla que su rol no incluye (la base igual lo rechazaría). */
export function SinPermiso({ texto = "Tu rol no incluye esta pantalla. Pídeselo al dueño." }: { texto?: string }) {
  return (
    <main className="flex flex-col items-center px-6 pb-8 pt-[calc(4rem+env(safe-area-inset-top,0px))] text-center">
      <span className="flex size-16 items-center justify-center rounded-full border border-dashed border-zinc-300 bg-hueso">
        <Lock className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight leading-tight">Sin permiso</h1>
      <p className="mt-2 text-lg text-tinta-2">{texto}</p>
      <Link href="/inicio" className={`${botonVariantes({ tamano: "lg" })} mt-6`}>
        Volver al inicio
      </Link>
    </main>
  );
}
