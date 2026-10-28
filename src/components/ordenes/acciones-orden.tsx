"use client";

import { useActionState, useCallback, useState } from "react";
import { cambiarEstadoOrden, cancelarOrden } from "@/app/acciones/ordenes";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Button } from "@/components/ui/button";
import { Hoja } from "@/components/ui/hoja";
import { AreaTexto } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoForm } from "@/lib/errores";
import { ETIQUETA_ESTADO, PASOS, siguienteEstado, textoAvanzar, type Estado } from "@/lib/ordenes";
import { cn } from "@/lib/utils";

/**
 * Lo que se hace con una orden abierta, abajo y al alcance del pulgar: el paso siguiente con un toque; otro estado
 * (para devolverla o saltarse pasos) y cancelar, en una hoja aparte.
 */
export function AccionesOrden({ id, estado }: { id: string; estado: Estado }) {
  const [res, accion, pendiente] = useActionState<EstadoForm, FormData>(cambiarEstadoOrden, { error: null });
  const [hoja, setHoja] = useState<"estados" | "cancelar" | null>(null);
  const cerrar = useCallback(() => setHoja(null), []);
  const siguiente = siguienteEstado(estado);

  return (
    <>
      <BarraAccion>
        {res.error && (
          <p role="alert" className="text-center text-base font-semibold text-rojo">
            {res.error}
          </p>
        )}
        {siguiente && (
          <form action={accion}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" name="estado" value={siguiente} tamano="lg" bloque disabled={pendiente}>
              {pendiente ? "Guardando…" : textoAvanzar(siguiente)}
            </Button>
          </form>
        )}
        <Button variante="secundario" bloque onClick={() => setHoja("estados")}>
          Otro estado o cancelar
        </Button>
      </BarraAccion>

      {hoja === "estados" && (
        <Hoja titulo="Cambiar el estado" onCerrar={cerrar}>
          <form
            action={async (formulario) => {
              accion(formulario);
              cerrar();
            }}
            className="space-y-2"
          >
            <input type="hidden" name="id" value={id} />
            {PASOS.map((p) => (
              <Button
                key={p}
                type="submit"
                name="estado"
                value={p}
                variante="secundario"
                bloque
                disabled={p === estado}
                className={cn("justify-start", p === estado && "font-semibold")}
              >
                {ETIQUETA_ESTADO[p]}
                {p === estado && " · ahora"}
              </Button>
            ))}
          </form>
          <Button variante="fantasma" bloque className="mt-4" onClick={() => setHoja("cancelar")}>
            Cancelar esta orden
          </Button>
        </Hoja>
      )}

      {hoja === "cancelar" && <CancelarOrden id={id} onCerrar={cerrar} />}
    </>
  );
}

/** Cancelar con su motivo (queda en la historia y no se puede deshacer). */
function CancelarOrden({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const [res, accion, pendiente] = useActionState<EstadoForm, FormData>(cancelarOrden, { error: null });
  const [motivo, setMotivo] = useState("");

  return (
    <Hoja titulo="Cancelar la orden" onCerrar={onCerrar}>
      <form action={accion} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <div>
          <Label htmlFor="motivo">Por qué se cancela</Label>
          <AreaTexto
            id="motivo"
            name="motivo"
            value={motivo}
            maxLength={200}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="El cliente se llevó el vehículo sin arreglar…"
          />
        </div>
        <p className="text-base text-tinta-2">La orden queda cerrada con este motivo. No se puede deshacer.</p>
        {res.error && (
          <p role="alert" className="text-base font-semibold text-rojo">
            {res.error}
          </p>
        )}
        <Button type="submit" variante="peligro" tamano="lg" bloque disabled={pendiente || motivo.trim().length < 3}>
          {pendiente ? "Cancelando…" : "Sí, cancelar la orden"}
        </Button>
        <Button variante="secundario" bloque onClick={onCerrar}>
          No, volver
        </Button>
      </form>
    </Hoja>
  );
}
