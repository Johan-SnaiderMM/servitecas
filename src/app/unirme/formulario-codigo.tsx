"use client";

import { useActionState, useState } from "react";
import { unirmeAlEquipo, type EstadoEntrada } from "@/app/acciones/sesion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatearCodigo, normalizarCodigo } from "@/lib/invitaciones";

/** Escribir (o recibir ya escrito, por el enlace) el código de invitación. Se muestra como K7MP-2XQ9. */
export function FormularioCodigo({ codigoInicial }: { codigoInicial: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoEntrada, FormData>(unirmeAlEquipo, { error: null });
  const [codigo, setCodigo] = useState(formatearCodigo(normalizarCodigo(codigoInicial).slice(0, 8)));

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="codigo" value={codigo} />
      <div>
        <Label htmlFor="codigo_invitacion">Código de invitación</Label>
        <Input
          id="codigo_invitacion"
          value={codigo}
          onChange={(e) => {
            const limpio = normalizarCodigo(e.target.value).slice(0, 8);
            setCodigo(limpio.length > 4 ? formatearCodigo(limpio.padEnd(8, " ")).trimEnd() : limpio);
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          placeholder="K7MP-2XQ9"
          className="text-center text-2xl font-semibold uppercase tracking-widest"
          required
        />
      </div>
      <Button type="submit" tamano="lg" bloque disabled={pendiente || normalizarCodigo(codigo).length < 8}>
        {pendiente ? "Entrando…" : "Entrar al equipo"}
      </Button>
      {estado.error && (
        <p role="alert" className="text-center text-base font-semibold text-rojo">
          {estado.error}
        </p>
      )}
    </form>
  );
}
