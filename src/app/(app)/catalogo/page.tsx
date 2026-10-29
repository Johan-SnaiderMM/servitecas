import Link from "@/components/ui/enlace";
import { Plus } from "lucide-react";
import { BarraAccion } from "@/components/layout/barra-accion";
import { EnlaceFila } from "@/components/layout/enlace-fila";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { ListaCatalogo } from "@/components/hallazgos/lista-catalogo";
import { botonVariantes } from "@/components/ui/button";
import { listarCatalogo } from "@/lib/datos/hallazgos";
import { ETIQUETA_CATEGORIA } from "@/lib/hallazgos";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Lista de hallazgos" };

/** La lista de hallazgos del taller (buscador y categorías, nunca entera): lo que el jefe de patio elige con un toque. */
export default async function Catalogo() {
  const { permitido } = await revisarPermiso("catalogo");
  if (!permitido) return <SinPermiso />;

  const items = await listarCatalogo(true);
  const archivados = items.filter((i) => !i.activo);

  return (
    <main className="px-4 pb-40 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">Lista de hallazgos</h1>
      <p className="mt-1 text-base text-tinta-2">
        Lo que el jefe de patio elige con un toque. La explicación es la que lee el cliente.
      </p>

      <section className="mt-5">
        <ListaCatalogo items={items.filter((i) => i.activo)} />
      </section>

      {/* Lo archivado se usa poco: plegado al final. */}
      {archivados.length > 0 && (
        <details className="mt-8">
          <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium uppercase tracking-wider text-tinta-2">
            Archivados · {archivados.length}
          </summary>
          <ul className="mt-2 space-y-2">
            {archivados.map((i) => (
              <li key={i.id}>
                <EnlaceFila href={`/catalogo/${i.id}`} titulo={i.nombre} detalle={ETIQUETA_CATEGORIA[i.categoria]} tenue />
              </li>
            ))}
          </ul>
        </details>
      )}

      <BarraAccion conNavegacion>
        <Link href="/catalogo/nuevo" className={botonVariantes({ tamano: "lg", bloque: true })}>
          <Plus className="size-5" aria-hidden />
          Agregar a la lista
        </Link>
      </BarraAccion>
    </main>
  );
}
