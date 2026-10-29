import Link from "@/components/ui/enlace";
import { Plus, UserRound } from "lucide-react";
import { BarraAccion } from "@/components/layout/barra-accion";
import { EnlaceFila } from "@/components/layout/enlace-fila";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { botonVariantes } from "@/components/ui/button";
import { listarEquipo } from "@/lib/datos/equipo";
import { fechaBogota, fechaCorta, horaCorta } from "@/lib/fechas";
import { formatearCodigo } from "@/lib/invitaciones";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Equipo" };

export default async function Equipo() {
  const { permitido } = await revisarPermiso("equipo");
  if (!permitido) return <SinPermiso />;

  const equipo = await listarEquipo();
  const nombreRol = new Map(equipo.roles.map((r) => [r.id, r.nombre]));

  return (
    <main className="px-4 pb-40 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">Equipo</h1>
      <p className="mt-1 text-base text-tinta-2">Quién usa la app y qué puede hacer cada quien.</p>

      <section className="mt-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">
          Personas · {equipo.personas.length}
        </h2>
        <ul className="mt-2 space-y-3">
          {equipo.personas.map((p) => {
            const roles =
              p.rol === "dueno" ? "Dueño" : p.roles.map((id) => nombreRol.get(id) ?? "Rol quitado").join(" · ") || "Sin roles";
            return (
              <li key={p.user_id}>
                {p.rol === "dueno" || p.yo ? (
                  <div className="flex min-h-16 items-center gap-3 rounded-xl border border-linea bg-white px-4 py-3">
                    <UserRound className="size-6 shrink-0 text-tinta-2" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium leading-tight">
                        {p.nombre}
                        {p.yo && " (tú)"}
                      </span>
                      <span className="mt-0.5 block text-base text-tinta-2">{roles}</span>
                    </span>
                  </div>
                ) : (
                  <EnlaceFila href={`/equipo/${p.user_id}`} titulo={p.nombre} detalle={roles} Icono={UserRound} />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Invitaciones sin usar</h2>
        {equipo.invitaciones.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base text-tinta-2">
            No hay invitaciones pendientes.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {equipo.invitaciones.map((i) => (
              <li key={i.id}>
                <EnlaceFila
                  href={`/equipo/invitacion/${i.id}`}
                  titulo={`${i.nombre} · ${formatearCodigo(i.codigo)}`}
                  detalle={`Vence ${fechaCorta(fechaBogota(i.expira_at))}, ${horaCorta(i.expira_at)}`}
                  tenue
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <BarraAccion conNavegacion>
        <Link href="/equipo/invitar" className={botonVariantes({ tamano: "lg", bloque: true })}>
          <Plus className="size-5" aria-hidden />
          Invitar a alguien
        </Link>
      </BarraAccion>
    </main>
  );
}
