import { notFound } from "next/navigation";
import { CompartirInvitacion } from "@/components/equipo/compartir-invitacion";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarEquipo } from "@/lib/datos/equipo";
import { fechaBogota, fechaLarga, horaCorta } from "@/lib/fechas";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Invitación" };

export default async function Invitacion({ params }: { params: Promise<{ id: string }> }) {
  const { taller, permitido } = await revisarPermiso("equipo");
  if (!permitido) return <SinPermiso />;

  const { id } = await params;
  const equipo = await listarEquipo();
  const inv = equipo.invitaciones.find((i) => i.id === id);
  // Usada, anulada o vencida: ya no está en la lista de pendientes.
  if (!inv) notFound();

  const nombreRoles = equipo.roles.filter((r) => inv.roles.includes(r.id)).map((r) => r.nombre);

  return (
    <>
      <EncabezadoTarea titulo="Invitación" volverA="/equipo" />
      <main className="space-y-4 px-4 pt-5">
        <p className="text-base text-tinta-2">
          <strong className="text-tinta">{inv.nombre}</strong>{" "}
          {nombreRoles.length > 0 ? `entrará como ${nombreRoles.join(" y ")}.` : "entrará sin roles."}
        </p>
        <CompartirInvitacion
          id={inv.id}
          codigo={inv.codigo}
          nombre={inv.nombre}
          taller={taller.nombre}
          venceTexto={`${fechaLarga(fechaBogota(inv.expira_at)).toLowerCase()}, ${horaCorta(inv.expira_at)}`}
        />
      </main>
    </>
  );
}
