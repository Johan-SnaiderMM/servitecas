"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { filtrarPatio, MIN_PARA_BUSCAR_EN_PATIO } from "@/lib/ordenes";
import type { OrdenEnPatio } from "@/lib/tipos/ordenes";
import { TarjetaOrden } from "./tarjeta-orden";

/**
 * Los vehículos del patio en dos grupos (asignados a quien mira y los demás). Desde unos cuantos, arriba sale un
 * buscador por placa, servicio, cliente o quién lo atiende: con el patio lleno nadie baja tarjeta por tarjeta.
 */
export function Patio({ mias, otras, ahora }: { mias: OrdenEnPatio[]; otras: OrdenEnPatio[]; ahora: number }) {
  const [busqueda, setBusqueda] = useState("");
  const conBuscador = mias.length + otras.length >= MIN_PARA_BUSCAR_EN_PATIO;
  const misVisibles = filtrarPatio(mias, busqueda);
  const otrasVisibles = filtrarPatio(otras, busqueda);
  const nada = busqueda.trim() !== "" && misVisibles.length + otrasVisibles.length === 0;

  return (
    <>
      {conBuscador && (
        <div className="relative mt-5">
          <label htmlFor="buscar-patio" className="sr-only">
            Buscar en el patio
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-tinta-2" aria-hidden />
          <Input
            id="buscar-patio"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar placa, cliente o servicio"
            autoComplete="off"
            className="pl-10"
          />
        </div>
      )}
      {nada && (
        <p className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base text-tinta-2" role="status">
          Ningún vehículo del patio coincide con «{busqueda.trim()}».
        </p>
      )}
      <Grupo titulo="Asignados a ti" ordenes={misVisibles} ahora={ahora} />
      <Grupo titulo={mias.length > 0 ? "Los demás" : "En el patio"} ordenes={otrasVisibles} ahora={ahora} />
    </>
  );
}

function Grupo({ titulo, ordenes, ahora }: { titulo: string; ordenes: OrdenEnPatio[]; ahora: number }) {
  if (ordenes.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">
        {titulo} · {ordenes.length}
      </h2>
      <ul className="mt-2 space-y-3">
        {ordenes.map((o) => (
          <li key={o.id}>
            <TarjetaOrden orden={o} ahoraMs={ahora} />
          </li>
        ))}
      </ul>
    </section>
  );
}
