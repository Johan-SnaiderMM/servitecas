"use client";

import { useActionState } from "react";
import { asignarOrden } from "@/app/acciones/ordenes";
import { Button } from "@/components/ui/button";
import { Hoja } from "@/components/ui/hoja";
import type { EstadoForm } from "@/lib/errores";
import { primerNombre } from "@/lib/ordenes";
import type { JefePatio } from "@/lib/tipos/ordenes";
import { cn } from "@/lib/utils";

/** Quién atiende el vehículo, en una hoja: un toque en el nombre y se guarda (se cierra sola si salió bien). */
export function AsignarOrden({
  id,
  actual,
  jefes,
  onCerrar,
}: {
  id: string;
  actual: string | null;
  jefes: JefePatio[];
  onCerrar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(async (anterior, datos) => {
    const r = await asignarOrden(anterior, datos);
    if (!r.error) onCerrar();
    return r;
  }, { error: null });

  const opciones = [
    { valor: "", texto: "Sin asignar" },
    ...jefes.map((j) => ({ valor: j.user_id, texto: j.yo ? `Yo (${primerNombre(j.nombre)})` : j.nombre })),
  ];

  return (
    <Hoja titulo="Quién lo atiende" onCerrar={onCerrar}>
      <form action={accion} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        {opciones.map((o) => {
          const ahora = o.valor === (actual ?? "");
          return (
            <Button
              key={o.valor || "nadie"}
              type="submit"
              name="asignado"
              value={o.valor}
              variante="secundario"
              bloque
              disabled={pendiente || ahora}
              className={cn("justify-start", ahora && "font-semibold")}
            >
              {o.texto}
              {ahora && " · ahora"}
            </Button>
          );
        })}
        {pendiente && <p className="text-base text-tinta-2">Guardando…</p>}
        {estado.error && (
          <p role="alert" className="text-base font-semibold text-rojo">
            {estado.error}
          </p>
        )}
      </form>
    </Hoja>
  );
}
