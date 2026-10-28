import type { ReactNode } from "react";
import { obtenerQuien } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";

// Depende de la sesión (cookies): nunca se prerenderiza.
export const dynamic = "force-dynamic";

/**
 * Pantallas de UNA sola tarea (crear o editar algo): sin barra de navegación, con flecha para volver y la acción
 * principal abajo (BarraAccion). Igual que `(app)`, exigen sesión y taller; el permiso de cada pantalla lo revisa su
 * page con `revisarPermiso` y, sobre todo, la base de datos.
 */
export default async function LayoutTarea({ children }: { children: ReactNode }) {
  await exigirSesion();
  await obtenerQuien();
  return <div className="columna-app pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">{children}</div>;
}
