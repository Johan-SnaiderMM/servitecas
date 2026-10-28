import { FormularioInvitacion } from "@/components/equipo/formulario-invitacion";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarEquipo } from "@/lib/datos/equipo";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Invitar" };

export default async function Invitar() {
  const { quien, permitido } = await revisarPermiso("equipo");
  if (!permitido) return <SinPermiso />;

  const equipo = await listarEquipo();
  // Solo se dan roles cuyas áreas ya se tienen (la base lo exige igual).
  const mias = new Set<string>(quien.areas);
  const asignables = equipo.roles.filter((r) => r.areas.every((a) => mias.has(a))).map((r) => r.id);

  return (
    <>
      <EncabezadoTarea titulo="Invitar al equipo" volverA="/equipo" />
      <FormularioInvitacion roles={equipo.roles} asignables={asignables} />
    </>
  );
}
