"use client";

import { useActionState, useCallback, useState } from "react";
import { RotateCcw } from "lucide-react";
import { reiniciarDemo } from "@/app/acciones/demo";
import { Button } from "@/components/ui/button";
import { Hoja } from "@/components/ui/hoja";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoForm } from "@/lib/errores";

/**
 * Reiniciar la demo: borra lo que se hizo en la visita y vuelven los datos de ejemplo. Pide confirmación porque no se
 * puede deshacer. `conPin`: la demo tiene PIN (lo pone quien la administra) y la base lo comprueba; así quien tenga la
 * demo abierta no la reinicia en plena visita.
 */
export function BotonReiniciarDemo({ conPin }: { conPin: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [pin, setPin] = useState("");
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(reiniciarDemo, { error: null });
  const cerrar = useCallback(() => {
    if (!pendiente) setAbierta(false);
  }, [pendiente]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-linea bg-white px-4 py-3 text-left active:bg-hueso"
      >
        <RotateCcw className="size-6 shrink-0 text-tinta-2" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium leading-tight">Reiniciar la demo</span>
          <span className="mt-0.5 block text-base text-tinta-2">Borra lo que hiciste y vuelven los datos de ejemplo</span>
        </span>
      </button>

      {abierta && (
        <Hoja titulo="¿Reiniciar la demo?" onCerrar={cerrar}>
          <form action={accion}>
            <p className="text-base">
              Se borra todo lo que se hizo en la visita (vehículos, fotos, hallazgos, mensajes y las personas que entraron
              con un código) y vuelve el patio de hoy con dos semanas de historia.
            </p>
            {conPin && (
              <div className="mt-4">
                <Label htmlFor="pin-reinicio">PIN de reinicio</Label>
                <Input
                  id="pin-reinicio"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  maxLength={8}
                  placeholder="Solo quien enseña la demo lo sabe"
                  disabled={pendiente}
                />
              </div>
            )}
            <p className="mt-3 text-base font-semibold">Esto no se puede deshacer.</p>
            {estado.error && (
              <p role="alert" className="mt-2 text-base font-semibold text-rojo">
                {estado.error}
              </p>
            )}
            <Button
              type="submit"
              variante="peligro"
              tamano="lg"
              bloque
              className="mt-4"
              disabled={pendiente || (conPin && pin.length < 4)}
            >
              {pendiente ? "Reiniciando…" : "Sí, reiniciar la demo"}
            </Button>
            <Button variante="fantasma" bloque className="mt-1" disabled={pendiente} onClick={cerrar}>
              Cancelar
            </Button>
          </form>
        </Hoja>
      )}
    </>
  );
}
