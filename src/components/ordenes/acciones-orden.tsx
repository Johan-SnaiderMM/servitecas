"use client";

import { useActionState, useCallback, useState } from "react";
import { ArrowRightLeft, Check, Copy, Ellipsis, ExternalLink, UserRoundCog } from "lucide-react";
import { cambiarEstadoOrden, cancelarOrden } from "@/app/acciones/ordenes";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Button, botonVariantes } from "@/components/ui/button";
import { Hoja } from "@/components/ui/hoja";
import { AreaTexto } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoForm } from "@/lib/errores";
import { ETIQUETA_ESTADO, PASOS, siguienteEstado, textoAvanzar, type Estado } from "@/lib/ordenes";
import type { JefePatio } from "@/lib/tipos/ordenes";
import { useOrigen } from "@/lib/use-origen";
import { cn } from "@/lib/utils";
import { AsignarOrden } from "./asignar-orden";

const FILA_HOJA = cn(botonVariantes({ variante: "secundario", bloque: true }), "justify-start");

/**
 * Lo que se hace con una orden abierta, abajo y al alcance del pulgar, en UNA fila: el paso siguiente con un toque y
 * «Más» para lo que se usa poco (otro estado, quién lo atiende, ver o copiar el enlace del cliente, cancelar), en hojas
 * aparte.
 */
export function AccionesOrden({
  id,
  estado,
  token,
  asignado,
  jefes,
}: {
  id: string;
  estado: Estado;
  token: string;
  asignado: string | null;
  jefes: JefePatio[];
}) {
  const [res, accion, pendiente] = useActionState<EstadoForm, FormData>(cambiarEstadoOrden, { error: null });
  const [hoja, setHoja] = useState<"mas" | "estados" | "asignar" | "cancelar" | null>(null);
  const [copiado, setCopiado] = useState(false);
  const cerrar = useCallback(() => {
    setHoja(null);
    setCopiado(false);
  }, []);
  const origen = useOrigen();
  const siguiente = siguienteEstado(estado);

  return (
    <>
      <BarraAccion>
        {res.error && (
          <p role="alert" className="text-center text-base font-semibold text-rojo">
            {res.error}
          </p>
        )}
        <div className="flex gap-2">
          {siguiente && (
            <form action={accion} className="min-w-0 flex-1">
              <input type="hidden" name="id" value={id} />
              <Button type="submit" name="estado" value={siguiente} tamano="lg" bloque disabled={pendiente}>
                {pendiente ? "Guardando…" : textoAvanzar(siguiente)}
              </Button>
            </form>
          )}
          <Button
            variante="secundario"
            tamano="lg"
            className={siguiente ? "shrink-0" : "flex-1"}
            onClick={() => setHoja("mas")}
            aria-haspopup="dialog"
          >
            <Ellipsis className="size-5" aria-hidden />
            Más
          </Button>
        </div>
      </BarraAccion>

      {hoja === "mas" && (
        <Hoja titulo="Más de esta orden" onCerrar={cerrar}>
          <div className="space-y-2">
            <Button variante="secundario" bloque className="justify-start" onClick={() => setHoja("estados")}>
              <ArrowRightLeft className="size-5" aria-hidden />
              Cambiar el estado
            </Button>
            <Button variante="secundario" bloque className="justify-start" onClick={() => setHoja("asignar")}>
              <UserRoundCog className="size-5" aria-hidden />
              Cambiar quién lo atiende
            </Button>
            <a href={`/o/${token}`} target="_blank" rel="noopener noreferrer" className={FILA_HOJA}>
              <ExternalLink className="size-5" aria-hidden />
              Ver lo que ve el cliente
            </a>
            <Button
              variante="secundario"
              bloque
              className="justify-start"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${origen}/o/${token}`);
                  setCopiado(true);
                } catch {
                  setCopiado(false);
                }
              }}
            >
              {copiado ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
              {copiado ? "Enlace copiado" : "Copiar el enlace del cliente"}
            </Button>
          </div>
          <Button variante="fantasma" bloque className="mt-4" onClick={() => setHoja("cancelar")}>
            Cancelar esta orden
          </Button>
        </Hoja>
      )}

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
        </Hoja>
      )}

      {hoja === "asignar" && <AsignarOrden id={id} actual={asignado} jefes={jefes} onCerrar={cerrar} />}

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
