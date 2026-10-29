"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contarPorCategoria, ETIQUETA_CATEGORIA, filtrarCatalogo, type Categoria } from "@/lib/hallazgos";

type Item = { id: string; nombre: string; descripcion: string; categoria: Categoria };

/**
 * Buscar en la lista de hallazgos del taller sin ver nunca la lista entera: arriba el buscador; sin nada escrito se
 * eligen las categorías (con cuántos tiene cada una) y solo entonces salen sus hallazgos. Lo que se hace con cada uno
 * (elegirlo para la orden, abrirlo para editarlo) lo pone quien lo usa con `fila`.
 */
export function BuscadorCatalogo<T extends Item>({
  items,
  etiqueta,
  fila,
  vacio,
}: {
  items: T[];
  /** El texto sobre el buscador: «Qué encontraste», «Buscar en la lista». */
  etiqueta: string;
  fila: (item: T) => ReactNode;
  /** Lo que se muestra cuando la búsqueda no encuentra nada. */
  vacio: string;
}) {
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const visibles = useMemo(() => filtrarCatalogo(items, { categoria, busqueda }), [items, categoria, busqueda]);
  const buscando = busqueda.trim() !== "";

  return (
    <div>
      <Label htmlFor="buscar-catalogo">{etiqueta}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-tinta-2" aria-hidden />
        <Input
          id="buscar-catalogo"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar: pastillas, amortiguador…"
          autoComplete="off"
          className="pl-10"
        />
      </div>

      {!buscando && !categoria && (
        <ul className="mt-3 grid grid-cols-2 gap-2" aria-label="Categorías">
          {contarPorCategoria(items).map(({ categoria: c, n }) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => setCategoria(c)}
                className="flex min-h-16 w-full items-center justify-between gap-2 rounded-xl border border-linea bg-white px-3 py-2 text-left active:bg-hueso"
              >
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-tight">{ETIQUETA_CATEGORIA[c]}</span>
                  <span className="block text-base text-tinta-2">{n}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-tinta-2" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!buscando && categoria && (
        <button
          type="button"
          onClick={() => setCategoria(null)}
          className="mt-3 flex min-h-12 items-center gap-2 rounded-xl pr-3 text-base font-medium active:bg-hueso"
        >
          <ArrowLeft className="size-5" aria-hidden />
          Todas las categorías
        </button>
      )}

      {(buscando || categoria) && (
        <>
          <p className="mt-3 text-sm font-medium uppercase tracking-wider text-tinta-2" role="status">
            {buscando || !categoria
              ? `${visibles.length} ${visibles.length === 1 ? "resultado" : "resultados"}`
              : `${ETIQUETA_CATEGORIA[categoria]} · ${visibles.length}`}
          </p>
          <ul className="mt-2 space-y-2">
            {visibles.map((i) => (
              <li key={i.id}>{fila(i)}</li>
            ))}
            {visibles.length === 0 && (
              <li className="rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base text-tinta-2">{vacio}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
