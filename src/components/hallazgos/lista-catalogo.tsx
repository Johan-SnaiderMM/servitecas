"use client";

import { EnlaceFila } from "@/components/layout/enlace-fila";
import { formatearPesos } from "@/lib/dinero";
import type { ItemCatalogo } from "@/lib/tipos/hallazgos";
import { BuscadorCatalogo } from "./buscador-catalogo";

/** La lista del taller para editarla: se busca o se entra por categoría, y cada hallazgo abre su ficha. */
export function ListaCatalogo({ items }: { items: ItemCatalogo[] }) {
  return (
    <BuscadorCatalogo
      items={items}
      etiqueta="Buscar en la lista"
      vacio="No hay ninguno así. Agrégalo con el botón de abajo."
      fila={(i) => (
        <EnlaceFila
          href={`/catalogo/${i.id}`}
          titulo={i.nombre}
          detalle={i.precio_sugerido === null ? undefined : `Precio sugerido: ${formatearPesos(i.precio_sugerido)}`}
        />
      )}
    />
  );
}
