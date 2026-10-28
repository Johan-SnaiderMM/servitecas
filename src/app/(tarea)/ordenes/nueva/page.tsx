import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { FormularioRecibir } from "@/components/ordenes/formulario-recibir";
import { puedeVer } from "@/lib/areas";
import { listarJefesPatio } from "@/lib/datos/ordenes";
import { revisarPermiso } from "@/lib/permisos";
import { nuevaClave } from "@/lib/reloj";

export const metadata = { title: "Recibir vehículo" };

export default async function RecibirVehiculo() {
  const { quien, permitido } = await revisarPermiso("recibir");
  if (!permitido) return <SinPermiso />;

  // La lista de jefes la lee quien maneja órdenes (recepción la tiene); la clave evita duplicar con mala señal.
  const jefes = puedeVer(quien, "ordenes") ? await listarJefesPatio() : [];

  return (
    <>
      <EncabezadoTarea titulo="Recibir vehículo" volverA="/inicio" />
      <FormularioRecibir clave={nuevaClave()} jefes={jefes} />
    </>
  );
}
