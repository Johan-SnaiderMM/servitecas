"use client";

import Link from "@/components/ui/enlace";
import { usePathname } from "next/navigation";
import { ChartColumn, House, Menu, type LucideIcon } from "lucide-react";
import { puedeVer, type Pantalla, type Quien } from "@/lib/areas";
import { cn } from "@/lib/utils";

type Item = { href: string; etiqueta: string; Icono: LucideIcon; pantalla: Pantalla };

/** Solo las pantallas que ya existen; cada fase agrega las suyas (órdenes, clientes…). */
const ITEMS: Item[] = [
  { href: "/inicio", etiqueta: "Inicio", Icono: House, pantalla: "inicio" },
  { href: "/resumen", etiqueta: "Resumen", Icono: ChartColumn, pantalla: "resumen" },
  { href: "/mas", etiqueta: "Más", Icono: Menu, pantalla: "mas" },
];

/** Barra de abajo: lo que no abre la persona no aparece. Etiquetas de 14 px, objetivos de 64 px. */
export function BarraNavegacion({ areas }: { areas: Quien["areas"] }) {
  const ruta = usePathname();
  const visibles = ITEMS.filter((i) => puedeVer({ areas }, i.pantalla));

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-white/80 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {visibles.map(({ href, etiqueta, Icono }) => {
          const activo = ruta === href || ruta.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-medium",
                  activo ? "text-tinta" : "text-tinta-2 active:bg-hueso"
                )}
              >
                <Icono className="size-6" strokeWidth={activo ? 2 : 1.5} aria-hidden />
                {etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
