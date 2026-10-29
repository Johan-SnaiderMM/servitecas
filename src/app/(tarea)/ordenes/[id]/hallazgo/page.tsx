import { notFound, redirect } from "next/navigation";
import { FormularioHallazgo } from "@/components/hallazgos/formulario-hallazgo";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarCatalogo } from "@/lib/datos/hallazgos";
import { obtenerOrden } from "@/lib/datos/ordenes";
import { ErrorApp } from "@/lib/errores";
import { esUuid } from "@/lib/fotos";
import { estaAbierta } from "@/lib/ordenes";
import { revisarPermiso } from "@/lib/permisos";
import { nuevaClave } from "@/lib/reloj";

export const metadata = { title: "Registrar hallazgo" };

export default async function RegistrarHallazgo({ params }: { params: Promise<{ id: string }> }) {
  const { permitido } = await revisarPermiso("hallazgo");
  if (!permitido) return <SinPermiso />;

  const { id } = await params;
  if (!esUuid(id)) notFound();
  const [orden, catalogo] = await Promise.all([
    obtenerOrden(id).catch((e) => {
      if (e instanceof ErrorApp && e.codigo === "P0002") return null;
      throw e;
    }),
    listarCatalogo(),
  ]);
  if (!orden) notFound();
  // A una orden cerrada ya no se le agregan hallazgos.
  if (!estaAbierta(orden.estado)) redirect(`/ordenes/${id}?ver=hallazgos`);

  return (
    <>
      <EncabezadoTarea titulo={`Hallazgo · Orden #${orden.numero}`} volverA={`/ordenes/${id}?ver=hallazgos`} />
      <FormularioHallazgo ordenId={id} clave={nuevaClave()} catalogo={catalogo} />
    </>
  );
}
