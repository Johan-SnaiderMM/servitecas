import Link from "@/components/ui/enlace";
import { CarFront, Plus, UserPlus } from "lucide-react";
import { AvisoDemo } from "@/components/demo/aviso-demo";
import { BarraAccion } from "@/components/layout/barra-accion";
import { EnlaceFila } from "@/components/layout/enlace-fila";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Patio } from "@/components/ordenes/patio";
import { botonVariantes } from "@/components/ui/button";
import { puedeVer } from "@/lib/areas";
import { listarOrdenes } from "@/lib/datos/ordenes";
import { primerNombre } from "@/lib/ordenes";
import { revisarPermiso } from "@/lib/permisos";
import { ahoraMs } from "@/lib/reloj";

export const metadata = { title: "Patio" };

/**
 * Inicio del personal: los vehículos que están en el patio, primero los asignados a quien mira. Quien no maneja
 * vehículos (por ejemplo, solo la lista de hallazgos) ve una bienvenida.
 */
export default async function Inicio() {
  const { taller, quien, permitido } = await revisarPermiso("inicio");
  if (!permitido) return <SinPermiso />;

  const veOrdenes = puedeVer(quien, "ordenes");
  const recibe = puedeVer(quien, "recibir");
  const patio = veOrdenes ? await listarOrdenes() : null;
  const ahora = ahoraMs();
  const mias = patio?.abiertas.filter((o) => o.mia) ?? [];
  const otras = patio?.abiertas.filter((o) => !o.mia) ?? [];

  return (
    <main className="px-4 pb-40 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
      <p className="text-sm font-medium uppercase tracking-wider text-tinta-2">{taller.nombre}</p>
      <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">
        {patio ? "Patio" : `Hola, ${primerNombre(quien.nombre)}`}
      </h1>

      {patio ? (
        <>
          <p className="mt-1 text-base text-tinta-2">
            {patio.abiertas.length === 1 ? "1 vehículo" : `${patio.abiertas.length} vehículos`} en el patio ·{" "}
            {patio.entregadas_hoy === 1 ? "1 entregado hoy" : `${patio.entregadas_hoy} entregados hoy`}
          </p>
          {taller.es_demo && <AvisoDemo className="mt-4" />}

          {patio.abiertas.length === 0 ? (
            <section className="mt-5 flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-hueso px-4 py-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full border border-linea bg-superficie">
                <CarFront className="size-7" aria-hidden />
              </span>
              <h2 className="mt-3 text-lg font-semibold">No hay vehículos en el patio</h2>
              <p className="mt-1 text-base text-tinta-2">
                {recibe ? "Cuando llegue uno, tócalo en «Recibir vehículo»." : "Cuando recepción reciba uno, aparece aquí."}
              </p>
            </section>
          ) : (
            <Patio mias={mias} otras={otras} ahora={ahora} />
          )}
        </>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-hueso p-4 text-base">
          {!quien.esDueno && quien.areas.length === 0
            ? "Todavía no tienes un rol asignado. Pídele al dueño del taller que te dé uno."
            : "Tu rol no incluye el patio. Encuentra lo tuyo en «Más»."}
        </p>
      )}

      {puedeVer(quien, "equipo") && patio && patio.abiertas.length === 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Para empezar</h2>
          <div className="mt-2">
            <EnlaceFila
              href="/equipo"
              titulo="Invita a tu equipo"
              detalle="Jefes de patio y recepción entran con un código, sin correo"
              Icono={UserPlus}
            />
          </div>
        </section>
      )}

      {recibe && (
        <BarraAccion conNavegacion>
          <Link href="/ordenes/nueva" className={botonVariantes({ tamano: "lg", bloque: true })}>
            <Plus className="size-5" aria-hidden />
            Recibir vehículo
          </Link>
        </BarraAccion>
      )}
    </main>
  );
}
