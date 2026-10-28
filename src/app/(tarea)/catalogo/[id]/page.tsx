import { notFound } from "next/navigation";
import { FormularioCatalogo } from "@/components/hallazgos/formulario-catalogo";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarCatalogo } from "@/lib/datos/hallazgos";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Hallazgo de la lista" };

export default async function ItemCatalogo({ params }: { params: Promise<{ id: string }> }) {
  const { permitido } = await revisarPermiso("catalogo");
  if (!permitido) return <SinPermiso />;

  const { id } = await params;
  const item = (await listarCatalogo(true)).find((i) => i.id === id);
  if (!item) notFound();

  return (
    <>
      <EncabezadoTarea titulo={item.activo ? "Editar" : "Archivado"} volverA="/catalogo" />
      <FormularioCatalogo item={item} />
    </>
  );
}
