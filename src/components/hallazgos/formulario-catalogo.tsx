"use client";

import { useActionState, useState } from "react";
import { fijarItemCatalogoActivo, guardarItemCatalogo } from "@/app/acciones/hallazgos";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Button } from "@/components/ui/button";
import { AreaTexto, Input, Selector } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatearMiles, leerPesos } from "@/lib/dinero";
import type { EstadoForm } from "@/lib/errores";
import { CATEGORIAS, ETIQUETA_CATEGORIA, type Categoria } from "@/lib/hallazgos";
import type { ItemCatalogo } from "@/lib/tipos/hallazgos";

/** Crear o editar un hallazgo de la lista del taller; los existentes se pueden archivar o restaurar. Campos controlados. */
export function FormularioCatalogo({ item }: { item: ItemCatalogo | null }) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(guardarItemCatalogo, { error: null });
  const [categoria, setCategoria] = useState<Categoria>(item?.categoria ?? "frenos");
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? "");
  const [precio, setPrecio] = useState(item?.precio_sugerido == null ? "" : formatearMiles(item.precio_sugerido));

  return (
    <>
      <form action={accion} className="space-y-5 px-4 pt-5">
        {item && <input type="hidden" name="id" value={item.id} />}
        <div>
          <Label htmlFor="categoria">Categoría</Label>
          <Selector
            id="categoria"
            name="categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as Categoria)}
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CATEGORIA[c]}
              </option>
            ))}
          </Selector>
        </div>
        <div>
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" name="nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="descripcion">Lo que lee el cliente</Label>
          <AreaTexto
            id="descripcion"
            name="descripcion"
            value={descripcion}
            maxLength={300}
            rows={4}
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <p className="mt-1 text-base text-tinta-2">Palabras sencillas: qué pasa y por qué importa.</p>
        </div>
        <div>
          <Label htmlFor="precio">Precio sugerido (opcional)</Label>
          <Input
            id="precio"
            name="precio"
            inputMode="numeric"
            value={precio}
            onChange={(e) => {
              const v = leerPesos(e.target.value);
              setPrecio(v === null ? "" : formatearMiles(v));
            }}
            placeholder="180.000"
          />
        </div>
        <BarraAccion>
          {estado.error && (
            <p role="alert" className="text-center text-base font-semibold text-rojo">
              {estado.error}
            </p>
          )}
          <Button type="submit" tamano="lg" bloque disabled={pendiente || !nombre.trim() || !descripcion.trim()}>
            {pendiente ? "Guardando…" : "Guardar"}
          </Button>
        </BarraAccion>
      </form>
      {item && <Archivar id={item.id} activo={item.activo} />}
    </>
  );
}

function Archivar({ id, activo }: { id: string; activo: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(fijarItemCatalogoActivo, { error: null });
  return (
    <form action={accion} className="px-4 pb-40 pt-6">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={String(!activo)} />
      <Button type="submit" variante="fantasma" bloque disabled={pendiente}>
        {activo ? "Archivar (deja de salir en la lista)" : "Restaurar en la lista"}
      </Button>
      {estado.error && (
        <p role="alert" className="mt-2 text-base font-semibold text-rojo">
          {estado.error}
        </p>
      )}
    </form>
  );
}
