"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Images, Search, X } from "lucide-react";
import { crearHallazgo } from "@/app/acciones/hallazgos";
import { subirFotoOrden } from "@/app/acciones/fotos";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Button } from "@/components/ui/button";
import { AreaTexto, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatearMiles, leerPesos } from "@/lib/dinero";
import { CATEGORIAS, ETIQUETA_CATEGORIA, MAX_FOTOS_HALLAZGO, type Categoria } from "@/lib/hallazgos";
import { comprimirImagen } from "@/lib/imagen";
import type { ItemCatalogo } from "@/lib/tipos/hallazgos";
import { cn } from "@/lib/utils";

type FotoLista = { archivo: File; vista: string };

/** Sin tildes ni mayúsculas, para buscar "pastillas" en "Pastillas de freno…". */
function plano(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Registrar un hallazgo en pocos toques: se elige de la lista del taller (la explicación para el cliente ya viene
 * escrita), se ajusta si hace falta, precio opcional y hasta 3 fotos. Primero se guarda el hallazgo, luego se suben
 * sus fotos y se vuelve a la orden para enviarlo por WhatsApp. Todos los campos son controlados.
 */
export function FormularioHallazgo({ ordenId, clave, catalogo }: { ordenId: string; clave: string; catalogo: ItemCatalogo[] }) {
  const router = useRouter();
  const [categoria, setCategoria] = useState<Categoria | "todas">("todas");
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<ItemCatalogo | "otro" | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [fotos, setFotos] = useState<FotoLista[]>([]);
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const vistas = useRef<string[]>([]);

  // Las vistas previas son URLs temporales: se liberan al salir.
  useEffect(() => () => vistas.current.forEach((v) => URL.revokeObjectURL(v)), []);

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    return catalogo.filter(
      (i) => (categoria === "todas" || i.categoria === categoria) && (!q || plano(`${i.nombre} ${i.descripcion}`).includes(q))
    );
  }, [catalogo, categoria, busqueda]);

  function elegir(item: ItemCatalogo | "otro") {
    setElegido(item);
    setError(null);
    if (item === "otro") {
      setTitulo("");
      setDescripcion("");
      setPrecio("");
    } else {
      setTitulo(item.nombre);
      setDescripcion(item.descripcion);
      setPrecio(item.precio_sugerido === null ? "" : formatearMiles(item.precio_sugerido));
    }
  }

  async function agregarFotos(lista: FileList | null) {
    const archivos = Array.from(lista ?? []).slice(0, MAX_FOTOS_HALLAZGO - fotos.length);
    setError(null);
    try {
      const nuevas: FotoLista[] = [];
      for (const a of archivos) {
        const archivo = await comprimirImagen(a);
        const vista = URL.createObjectURL(archivo);
        vistas.current.push(vista);
        nuevas.push({ archivo, vista });
      }
      setFotos((actual) => [...actual, ...nuevas]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar la foto.");
    } finally {
      if (camara.current) camara.current.value = "";
      if (galeria.current) galeria.current.value = "";
    }
  }

  async function guardar() {
    setError(null);
    setPaso("Guardando…");
    const datos = new FormData();
    datos.set("clave", clave);
    datos.set("orden", ordenId);
    datos.set("titulo", titulo);
    datos.set("descripcion", descripcion);
    datos.set("precio", precio);
    if (elegido && elegido !== "otro") datos.set("catalogo", elegido.id);
    try {
      const r = await crearHallazgo(datos);
      if (!r.ok) {
        setError(r.error);
        setPaso(null);
        return;
      }
      for (const [i, f] of fotos.entries()) {
        setPaso(`Subiendo foto ${i + 1} de ${fotos.length}…`);
        const foto = new FormData();
        foto.set("orden", ordenId);
        foto.set("hallazgo", r.datos.id);
        foto.set("clave", crypto.randomUUID());
        foto.set("foto", f.archivo);
        const s = await subirFotoOrden(foto);
        if (!s.ok) {
          // El hallazgo ya quedó: se vuelve a la orden igual y se avisa.
          setError(`El hallazgo quedó guardado, pero una foto no subió: ${s.error}`);
          break;
        }
      }
      router.push(`/ordenes/${ordenId}?hallazgo=${r.datos.id}`);
    } catch {
      setError("No se pudo guardar. Revisa la señal e intenta otra vez.");
      setPaso(null);
    }
  }

  const listo = titulo.trim() !== "" && descripcion.trim() !== "";

  return (
    <div className="space-y-5 px-4 pb-6 pt-5">
      {!elegido ? (
        <section>
          <Label htmlFor="buscar">Qué encontraste</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-tinta-2" aria-hidden />
            <Input
              id="buscar"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar: pastillas, amortiguador…"
              autoComplete="off"
              className="pl-10"
            />
          </div>
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Categorías">
            {(["todas", ...CATEGORIAS] as const).map((c) => (
              <li key={c} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={categoria === c}
                  onClick={() => setCategoria(c)}
                  className={cn(
                    "min-h-12 rounded-full border px-4 text-base font-medium whitespace-nowrap",
                    categoria === c ? "border-tinta bg-tinta text-white" : "border-linea bg-white text-tinta active:bg-hueso"
                  )}
                >
                  {c === "todas" ? "Todas" : ETIQUETA_CATEGORIA[c]}
                </button>
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-2">
            {visibles.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => elegir(i)}
                  className="flex min-h-14 w-full flex-col items-start rounded-xl border border-linea bg-white px-4 py-3 text-left active:bg-hueso"
                >
                  <span className="text-base font-medium leading-tight">{i.nombre}</span>
                  <span className="mt-0.5 text-base text-tinta-2">{ETIQUETA_CATEGORIA[i.categoria]}</span>
                </button>
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base text-tinta-2">
                No está en la lista. Escríbelo abajo.
              </li>
            )}
          </ul>
          <Button variante="secundario" bloque className="mt-3" onClick={() => elegir("otro")}>
            Escribir otro hallazgo
          </Button>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium uppercase tracking-wider text-tinta-2">
              {elegido === "otro" ? "Hallazgo escrito a mano" : ETIQUETA_CATEGORIA[elegido.categoria]}
            </p>
            <Button variante="fantasma" onClick={() => setElegido(null)}>
              Cambiar
            </Button>
          </div>

          <div>
            <Label htmlFor="titulo">Qué se encontró</Label>
            <Input id="titulo" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="descripcion">Lo que lee el cliente</Label>
            <AreaTexto
              id="descripcion"
              value={descripcion}
              maxLength={300}
              rows={4}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Explícale en palabras sencillas qué pasa y por qué importa."
            />
          </div>

          <div>
            <Label htmlFor="precio">Precio (opcional)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-tinta-2">$</span>
              <Input
                id="precio"
                inputMode="numeric"
                value={precio}
                onChange={(e) => {
                  const v = leerPesos(e.target.value);
                  setPrecio(v === null ? "" : formatearMiles(v));
                }}
                placeholder="180.000"
                className="pl-7"
              />
            </div>
            <p className="mt-1 text-base text-tinta-2">Sin precio, el cliente lee «Te confirmamos el valor».</p>
          </div>

          <section>
            <p className="mb-1.5 text-sm font-medium uppercase tracking-wider text-tinta-2">
              Fotos ({fotos.length} de {MAX_FOTOS_HALLAZGO})
            </p>
            <input
              ref={camara}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-label="Tomar foto"
              onChange={(e) => void agregarFotos(e.target.files)}
            />
            <input
              ref={galeria}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Elegir fotos de la galería"
              onChange={(e) => void agregarFotos(e.target.files)}
            />
            {fotos.length > 0 && (
              <ul className="mb-2 grid grid-cols-3 gap-2">
                {fotos.map((f, i) => (
                  <li key={f.vista} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                    <img src={f.vista} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg border border-linea object-cover" />
                    <button
                      type="button"
                      aria-label={`Quitar la foto ${i + 1}`}
                      onClick={() => setFotos((actual) => actual.filter((x) => x !== f))}
                      className="absolute right-1 top-1 flex size-12 items-center justify-center rounded-full"
                    >
                      <span className="flex size-8 items-center justify-center rounded-full border border-linea bg-white">
                        <X className="size-5" aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fotos.length < MAX_FOTOS_HALLAZGO && (
              <div className="flex gap-2">
                <Button variante="secundario" className="flex-1" onClick={() => camara.current?.click()} disabled={Boolean(paso)}>
                  <Camera className="size-5" aria-hidden />
                  Tomar foto
                </Button>
                <Button variante="secundario" className="flex-1" onClick={() => galeria.current?.click()} disabled={Boolean(paso)}>
                  <Images className="size-5" aria-hidden />
                  Galería
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      {elegido && (
        <BarraAccion>
          {error && (
            <p role="alert" className="text-center text-base font-semibold text-rojo">
              {error}
            </p>
          )}
          <Button tamano="lg" bloque disabled={!listo || Boolean(paso)} onClick={() => void guardar()}>
            {paso ?? "Guardar hallazgo"}
          </Button>
        </BarraAccion>
      )}
    </div>
  );
}
