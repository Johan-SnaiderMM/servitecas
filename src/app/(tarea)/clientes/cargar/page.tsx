import { CargarClientes } from "@/components/clientes/cargar-clientes";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Cargar clientes" };

/** Cargar los clientes que el taller ya tiene (de su programa de facturación) desde un archivo CSV. */
export default async function PaginaCargarClientes() {
  const { permitido } = await revisarPermiso("clientes");
  if (!permitido) return <SinPermiso />;

  return (
    <>
      <EncabezadoTarea titulo="Cargar clientes" volverA="/mas" />
      <CargarClientes />
    </>
  );
}
