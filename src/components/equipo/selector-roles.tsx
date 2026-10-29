"use client";

import { ETIQUETA_AREA } from "@/lib/areas";
import type { RolEquipo } from "@/lib/tipos/equipo";
import { cn } from "@/lib/utils";

/**
 * Casillas de roles con lo que abre cada uno. Un rol que quien administra no puede dar sale apagado (borde punteado y
 * fondo gris, nunca con opacity); la base igual lo rechazaría.
 */
export function SelectorRoles({
  titulo,
  roles,
  habilitados,
  elegidos,
  onCambio,
}: {
  titulo: string;
  roles: RolEquipo[];
  /** Ids de los roles que se pueden marcar o desmarcar. */
  habilitados: string[];
  elegidos: string[];
  onCambio: (elegidos: string[]) => void;
}) {
  const alternar = (id: string) => onCambio(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]);

  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium uppercase tracking-wider text-tinta-2">{titulo}</legend>
      <ul className="space-y-2">
        {roles.map((r) => {
          const permitido = habilitados.includes(r.id);
          return (
            <li key={r.id}>
              <label
                className={cn(
                  "flex min-h-14 items-start gap-3 rounded-xl border px-4 py-3",
                  permitido ? "border-linea bg-superficie" : "border-dashed border-zinc-300 bg-hueso"
                )}
              >
                <input
                  type="checkbox"
                  checked={elegidos.includes(r.id)}
                  disabled={!permitido}
                  onChange={() => alternar(r.id)}
                  className="mt-0.5 size-6 shrink-0 accent-tinta"
                />
                <span className="min-w-0">
                  <span className="block text-lg font-semibold leading-tight">{r.nombre}</span>
                  <span className="block text-base text-tinta-2">
                    {r.areas.map((a) => ETIQUETA_AREA[a]).join(" · ") || "Sin permisos"}
                    {!permitido && " · no puedes dar estos permisos"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
