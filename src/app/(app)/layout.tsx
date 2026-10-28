import type { ReactNode } from "react";
import { BarraNavegacion } from "@/components/layout/barra-navegacion";
import { obtenerQuien } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";

// Todo lo del personal depende de la sesión (cookies): nunca se prerenderiza, ni en el build.
export const dynamic = "force-dynamic";

/**
 * Pantallas del personal con navegación inferior. Exigen sesión y pertenecer a un taller (si no, a /entrar).
 * Los layouts no se vuelven a ejecutar al navegar: la barrera real por pantalla es `revisarPermiso` en cada page
 * y, sobre todo, la base de datos.
 */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  await exigirSesion();
  const { quien } = await obtenerQuien();
  return (
    <div className="columna-app pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {children}
      <BarraNavegacion areas={quien.areas} />
    </div>
  );
}
