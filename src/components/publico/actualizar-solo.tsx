"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a pedir la página cada cierto tiempo mientras está a la vista (y al volver a ella): el cliente ve el avance
 * sin recargar. Con la pestaña oculta no gasta datos.
 */
export function ActualizarSolo({ cadaSegundos = 60 }: { cadaSegundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const intervalo = window.setInterval(refrescar, cadaSegundos * 1000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [router, cadaSegundos]);

  return null;
}
