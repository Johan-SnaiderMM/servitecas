import { ClipboardList, FileUp, LogOut, UserPlus, type LucideIcon } from "lucide-react";
import { salir } from "@/app/acciones/sesion";
import { AvisosPush } from "@/components/avisos/avisos-push";
import { AvisoDemo } from "@/components/demo/aviso-demo";
import { BotonReiniciarDemo } from "@/components/demo/boton-reiniciar-demo";
import { EnlaceFila } from "@/components/layout/enlace-fila";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Button } from "@/components/ui/button";
import { SelectorTema } from "@/components/ui/selector-tema";
import { puedeVer, type Pantalla } from "@/lib/areas";
import { revisarPermiso } from "@/lib/permisos";

export const metadata = { title: "Más" };

type Enlace = { href: string; etiqueta: string; detalle: string; Icono: LucideIcon; pantalla: Pantalla };

/** Configuración del taller: cada enlace aparece solo si el rol abre esa pantalla. Cada fase agrega los suyos. */
const ENLACES: Enlace[] = [
  {
    href: "/catalogo",
    etiqueta: "Lista de hallazgos",
    detalle: "Lo que el jefe de patio elige con un toque y lo que lee el cliente",
    Icono: ClipboardList,
    pantalla: "catalogo",
  },
  {
    href: "/clientes/cargar",
    etiqueta: "Cargar clientes",
    detalle: "Trae los clientes de tu programa de facturación desde un archivo",
    Icono: FileUp,
    pantalla: "clientes",
  },
  {
    href: "/equipo",
    etiqueta: "Equipo",
    detalle: "Invita a tu gente y decide qué puede hacer cada quien",
    Icono: UserPlus,
    pantalla: "equipo",
  },
];

export default async function Mas() {
  const { taller, quien, permitido } = await revisarPermiso("mas");
  if (!permitido) return <SinPermiso />;

  const rol = quien.esDueno ? "Dueño" : quien.roles.length > 0 ? quien.roles.join(" · ") : "Sin rol asignado";
  const enlaces = ENLACES.filter((e) => puedeVer(quien, e.pantalla));

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">Más</h1>

      <dl className="mt-5 divide-y divide-hueso rounded-xl border border-linea bg-superficie">
        <div className="px-4 py-3">
          <dt className="text-sm font-medium uppercase tracking-wider text-tinta-2">Taller</dt>
          <dd className="mt-0.5 text-lg font-semibold">{taller.nombre}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-sm font-medium uppercase tracking-wider text-tinta-2">Tú</dt>
          <dd className="mt-0.5 text-lg font-semibold">{quien.nombre}</dd>
          <dd className="text-base text-tinta-2">{rol}</dd>
        </div>
      </dl>

      {enlaces.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Configuración</h2>
          <ul className="mt-2 space-y-3">
            {enlaces.map(({ href, etiqueta, detalle, Icono }) => (
              <li key={href}>
                <EnlaceFila href={href} titulo={etiqueta} detalle={detalle} Icono={Icono} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Quien trabaja vehículos puede recibir en este celular los avisos de las respuestas de los clientes. */}
      {puedeVer(quien, "ordenes") && (
        <div className="mt-6">
          <AvisosPush llavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null} />
        </div>
      )}

      <SelectorTema />

      {/* La demo: se avisa que es de ejemplo y el gerente la puede reiniciar (borra lo de la visita y recarga los datos). */}
      {taller.es_demo && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Demostración</h2>
          <AvisoDemo className="mt-2" />
          {quien.esDueno && (
            <div className="mt-3">
              <BotonReiniciarDemo conPin={taller.reinicio_con_pin} />
            </div>
          )}
        </section>
      )}

      <form action={salir} className="mt-8">
        <Button type="submit" variante="secundario" tamano="lg" bloque>
          <LogOut className="size-5" aria-hidden />
          {taller.es_demo ? "Salir de la demo" : "Salir"}
        </Button>
      </form>
    </main>
  );
}
