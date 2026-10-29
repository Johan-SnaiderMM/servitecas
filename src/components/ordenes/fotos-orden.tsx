"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Images } from "lucide-react";
import { quitarFotoOrden, subirFotoOrden } from "@/app/acciones/fotos";
import { Button } from "@/components/ui/button";
import { Hoja } from "@/components/ui/hoja";
import type { EstadoForm } from "@/lib/errores";
import { horaCorta } from "@/lib/fechas";
import { MAX_FOTOS_INGRESO } from "@/lib/fotos";
import { comprimirImagen } from "@/lib/imagen";
import type { FotoOrden } from "@/lib/tipos/ordenes";

/**
 * Fotos de ingreso de una orden: cómo llegó el vehículo (golpes, rayones). Se toman con la cámara o se eligen de la
 * galería (varias a la vez); cada una se achica en el celular y se sube por separado, con su propia clave. Tocar una
 * la abre en grande; con la orden abierta, desde ahí se puede quitar.
 */
export function FotosOrden({ ordenId, fotos, abierta }: { ordenId: string; fotos: FotoOrden[]; abierta: boolean }) {
  const router = useRouter();
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const cerrar = useCallback(() => setAbiertaId(null), []);

  const espacio = MAX_FOTOS_INGRESO - fotos.length;
  const vista = fotos.find((f) => f.id === abiertaId) ?? null;

  async function subir(lista: FileList | null) {
    const archivos = Array.from(lista ?? []);
    if (archivos.length === 0) return;
    setError(null);
    const aSubir = archivos.slice(0, Math.max(0, espacio));
    if (aSubir.length < archivos.length) setError(`Solo caben ${MAX_FOTOS_INGRESO} fotos de ingreso: se subirán ${aSubir.length}.`);
    setProgreso({ hechas: 0, total: aSubir.length });
    try {
      for (const [i, archivo] of aSubir.entries()) {
        const foto = await comprimirImagen(archivo);
        const datos = new FormData();
        datos.set("orden", ordenId);
        datos.set("clave", crypto.randomUUID());
        datos.set("foto", foto);
        const r = await subirFotoOrden(datos);
        if (!r.ok) {
          setError(r.error);
          break;
        }
        setProgreso({ hechas: i + 1, total: aSubir.length });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto. Revisa la señal e intenta otra vez.");
    } finally {
      setProgreso(null);
      if (camara.current) camara.current.value = "";
      if (galeria.current) galeria.current.value = "";
      router.refresh();
    }
  }

  return (
    <div>
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Tomar foto"
        onChange={(e) => void subir(e.target.files)}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Elegir fotos de la galería"
        onChange={(e) => void subir(e.target.files)}
      />

      {abierta && (
        <div className="mb-3 flex gap-2">
          <Button
            variante="secundario"
            className="flex-1"
            disabled={Boolean(progreso) || espacio <= 0}
            onClick={() => camara.current?.click()}
          >
            <Camera className="size-5" aria-hidden />
            Tomar foto
          </Button>
          <Button
            variante="secundario"
            className="flex-1"
            disabled={Boolean(progreso) || espacio <= 0}
            onClick={() => galeria.current?.click()}
          >
            <Images className="size-5" aria-hidden />
            Galería
          </Button>
        </div>
      )}
      {progreso && (
        <p className="mb-3 text-base text-tinta-2" role="status">
          Subiendo {progreso.total === 1 ? "la foto" : `${Math.min(progreso.hechas + 1, progreso.total)} de ${progreso.total}`}…
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-base font-semibold text-rojo">
          {error}
        </p>
      )}

      {fotos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {fotos.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setAbiertaId(f.id)}
                className="block aspect-square w-full overflow-hidden rounded-lg border border-linea bg-hueso"
                aria-label={`Ver foto de ingreso de las ${horaCorta(f.at)}`}
              >
                {/* Servida por la app con permiso: next/image no aporta aquí. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/foto/orden/${f.id}`} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base text-tinta-2">
          {abierta ? "Toma fotos de cómo llegó: golpes, rayones, llantas. Así nadie discute después." : "Sin fotos de ingreso."}
        </p>
      )}

      {vista && <VerFoto foto={vista} ordenId={ordenId} puedeQuitar={abierta} onCerrar={cerrar} />}
    </div>
  );
}

/** La foto en grande; con la orden abierta se puede quitar (queda anulada, no se borra). */
function VerFoto({
  foto,
  ordenId,
  puedeQuitar,
  onCerrar,
}: {
  foto: FotoOrden;
  ordenId: string;
  puedeQuitar: boolean;
  onCerrar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(async (anterior, datos) => {
    const r = await quitarFotoOrden(anterior, datos);
    if (!r.error) onCerrar();
    return r;
  }, { error: null });
  const [confirmar, setConfirmar] = useState(false);

  return (
    <Hoja titulo="Foto de ingreso" onCerrar={onCerrar}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/foto/orden/${foto.id}`} alt="Foto de ingreso" className="w-full rounded-lg border border-linea" />
      <p className="mt-2 text-base text-tinta-2">
        {horaCorta(foto.at)}
        {foto.autor && ` · ${foto.autor}`}
      </p>
      {puedeQuitar && (
        <form action={accion} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={foto.id} />
          <input type="hidden" name="orden" value={ordenId} />
          {confirmar ? (
            <>
              <Button type="submit" variante="peligro" bloque disabled={pendiente}>
                {pendiente ? "Quitando…" : "Sí, quitar esta foto"}
              </Button>
              <Button variante="secundario" bloque onClick={() => setConfirmar(false)}>
                No, dejarla
              </Button>
            </>
          ) : (
            <Button variante="fantasma" bloque onClick={() => setConfirmar(true)}>
              Quitar esta foto
            </Button>
          )}
          {estado.error && (
            <p role="alert" className="text-base font-semibold text-rojo">
              {estado.error}
            </p>
          )}
        </form>
      )}
    </Hoja>
  );
}
