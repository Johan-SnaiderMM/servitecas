import { notFound, redirect } from "next/navigation";
import { FormularioRolesMiembro } from "@/components/equipo/formulario-roles-miembro";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarEquipo } from "@/lib/datos/equipo";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Persona del equipo" };

export default async function PersonaDelEquipo({ params }: { params: Promise<{ id: string }> }) {
  const { quien, permitido } = await revisarPermiso("equipo");
  if (!permitido) return <SinPermiso />;

  const { id } = await params;
  const equipo = await listarEquipo();
  const persona = equipo.personas.find((p) => p.user_id === id);
  if (!persona) notFound();
  // Al dueño y a uno mismo no se les cambian los roles aquí.
  if (persona.rol === "dueno" || persona.yo) redirect("/equipo");

  const mias = new Set<string>(quien.areas);
  const asignables = equipo.roles.filter((r) => r.areas.every((a) => mias.has(a))).map((r) => r.id);

  return (
    <>
      <EncabezadoTarea titulo={persona.nombre} volverA="/equipo" />
      <FormularioRolesMiembro
        userId={persona.user_id}
        nombre={persona.nombre}
        roles={equipo.roles}
        asignables={asignables}
        actuales={persona.roles}
      />
    </>
  );
}
