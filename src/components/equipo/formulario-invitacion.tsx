"use client";

import { useActionState, useState } from "react";
import { crearInvitacion } from "@/app/acciones/equipo";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoForm } from "@/lib/errores";
import type { RolEquipo } from "@/lib/tipos/equipo";
import { SelectorRoles } from "./selector-roles";

/**
 * Invitar a alguien al equipo: su nombre y sus roles. Los roles que dan permisos que quien invita no tiene salen
 * apagados (la base igual lo rechaza). Campos controlados.
 */
export function FormularioInvitacion({
  roles,
  asignables,
}: {
  roles: RolEquipo[];
  /** Ids de los roles que quien invita puede dar. */
  asignables: string[];
}) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(crearInvitacion, { error: null });
  const [nombre, setNombre] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);

  return (
    <form action={accion} className="space-y-5 px-4 pt-5">
      <input type="hidden" name="nombre" value={nombre} />
      <input type="hidden" name="roles" value={JSON.stringify(elegidos)} />

      <div>
        <Label htmlFor="nombre_invitado">Nombre de la persona</Label>
        <Input
          id="nombre_invitado"
          value={nombre}
          maxLength={40}
          autoComplete="off"
          placeholder="Mateo, Ruth…"
          onChange={(e) => setNombre(e.target.value)}
        />
        <p className="mt-1 text-base text-tinta-2">Así aparecerá en la app.</p>
      </div>

      <SelectorRoles titulo="Qué puede hacer" roles={roles} habilitados={asignables} elegidos={elegidos} onCambio={setElegidos} />

      <BarraAccion>
        {estado.error && (
          <p role="alert" className="text-center text-base font-semibold text-rojo">
            {estado.error}
          </p>
        )}
        <Button type="submit" tamano="lg" bloque disabled={pendiente || nombre.trim() === "" || elegidos.length === 0}>
          {pendiente ? "Creando…" : "Crear invitación"}
        </Button>
      </BarraAccion>
    </form>
  );
}
