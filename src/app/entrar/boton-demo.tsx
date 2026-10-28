"use client";

import { useActionState } from "react";
import { entrarDemo, type EstadoEntrada } from "@/app/acciones/sesion";
import { Button } from "@/components/ui/button";

// Una acción fija por cuenta (no una nueva en cada render).
const ACCIONES = { gerente: entrarDemo.bind(null, "gerente"), jefe: entrarDemo.bind(null, "jefe") };

/** «Probar la demo»: entra al taller de demostración (datos inventados) como gerente o como jefe de patio. */
export function BotonDemo({ quien, children }: { quien: "gerente" | "jefe"; children: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoEntrada>(ACCIONES[quien], { error: null });
  return (
    <form action={accion}>
      <Button type="submit" variante="secundario" tamano="lg" bloque disabled={pendiente}>
        {pendiente ? "Abriendo la demo…" : children}
      </Button>
      {estado.error && (
        <p role="alert" className="mt-2 text-center text-base font-semibold text-rojo">
          {estado.error}
        </p>
      )}
    </form>
  );
}
