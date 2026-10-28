"use client";

import { useActionState, useState } from "react";
import { asignarOrden } from "@/app/acciones/ordenes";
import { Selector } from "@/components/ui/input";
import type { EstadoForm } from "@/lib/errores";
import { primerNombre } from "@/lib/ordenes";
import type { JefePatio } from "@/lib/tipos/ordenes";

/** Quién atiende el vehículo. Al elegir se guarda solo (sin botón aparte). */
export function AsignarOrden({ id, actual, jefes }: { id: string; actual: string | null; jefes: JefePatio[] }) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(asignarOrden, { error: null });
  const [elegido, setElegido] = useState(actual ?? "");

  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <label htmlFor="asignado" className="sr-only">
        Quién lo atiende
      </label>
      <Selector
        id="asignado"
        name="asignado"
        value={elegido}
        disabled={pendiente}
        onChange={(e) => {
          setElegido(e.target.value);
          e.currentTarget.form?.requestSubmit();
        }}
      >
        <option value="">Sin asignar</option>
        {jefes.map((j) => (
          <option key={j.user_id} value={j.user_id}>
            {j.yo ? `Yo (${primerNombre(j.nombre)})` : j.nombre}
          </option>
        ))}
      </Selector>
      {pendiente && <p className="mt-1 text-base text-tinta-2">Guardando…</p>}
      {estado.error && (
        <p role="alert" className="mt-1 text-base font-semibold text-rojo">
          {estado.error}
        </p>
      )}
    </form>
  );
}
