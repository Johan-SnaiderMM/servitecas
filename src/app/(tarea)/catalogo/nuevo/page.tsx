import { FormularioCatalogo } from "@/components/hallazgos/formulario-catalogo";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Agregar a la lista" };

export default async function NuevoItemCatalogo() {
  const { permitido } = await revisarPermiso("catalogo");
  if (!permitido) return <SinPermiso />;

  return (
    <>
      <EncabezadoTarea titulo="Agregar a la lista" volverA="/catalogo" />
      <FormularioCatalogo item={null} />
    </>
  );
}
