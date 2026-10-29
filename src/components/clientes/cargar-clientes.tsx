"use client";

import { useRef, useState, useTransition } from "react";
import Link from "@/components/ui/enlace";
import { CircleCheck, Download, FileUp, TriangleAlert } from "lucide-react";
import { importarClientes } from "@/app/acciones/importar";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Button, botonVariantes } from "@/components/ui/button";
import { MAX_BYTES, decodificarArchivo, revisarArchivo, type FilaLista, type Problema } from "@/lib/importar-clientes";
import type { ResultadoImportar } from "@/lib/tipos/importar";

/** Cuántos problemas se listan; el resto se cuenta. */
const MOSTRAR = 20;

type Previa = {
  archivo: string;
  filas: FilaLista[];
  /** Lo que no se va a cargar: lo que vio el celular más lo que dijo la base. */
  problemas: Problema[];
  repetidas: number;
  resultado: ResultadoImportar;
};

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;

/**
 * Cargar clientes desde un CSV: se elige el archivo, el celular lo revisa, la base calcula qué va a crear sin guardar
 * nada (vista previa) y solo con «Guardar» se cargan. Así nadie llena el taller de datos malos por un archivo raro.
 */
export function CargarClientes() {
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [listo, setListo] = useState<ResultadoImportar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function reiniciar() {
    setPrevia(null);
    setListo(null);
    setError(null);
    if (entrada.current) entrada.current.value = "";
  }

  function alElegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setPrevia(null);
    setListo(null);
    if (archivo.size > MAX_BYTES) {
      setError("El archivo pesa demasiado (más de 1 MB). Divídelo en partes.");
      return;
    }
    iniciar(async () => {
      try {
        const texto = decodificarArchivo(new Uint8Array(await archivo.arrayBuffer()));
        const r = revisarArchivo(texto);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const rev = r.revision;
        if (rev.listas.length === 0) {
          setError("Ninguna fila se puede cargar. Revisa que el archivo tenga el celular de cada cliente.");
          setPrevia(null);
          return;
        }
        const base = await importarClientes(rev.listas, false);
        if (!base.ok) {
          setError(base.error);
          return;
        }
        setPrevia({
          archivo: archivo.name,
          filas: rev.listas,
          problemas: [...rev.errores, ...rev.conflictos, ...base.datos.errores, ...base.datos.conflictos].sort(
            (a, b) => a.fila - b.fila
          ),
          repetidas: rev.repetidas,
          resultado: base.datos,
        });
      } catch {
        setError("No se pudo leer el archivo. Guárdalo como CSV y vuelve a intentarlo.");
      }
    });
  }

  function guardar() {
    if (!previa) return;
    setError(null);
    iniciar(async () => {
      try {
        const r = await importarClientes(previa.filas, true);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setListo(r.datos);
        setPrevia(null);
      } catch {
        setError("No se pudo guardar. Revisa la señal e intenta otra vez.");
      }
    });
  }

  if (listo) {
    return (
      <main className="space-y-4 px-4 pb-8 pt-5">
        <section className="rounded-xl border border-linea bg-white p-4">
          <CircleCheck className="size-8 text-verde" aria-hidden />
          <h2 className="mt-2 text-xl font-semibold">Clientes cargados</h2>
          <p className="mt-1 text-base">
            {plural(listo.clientes_nuevos, "cliente nuevo", "clientes nuevos")} y{" "}
            {plural(listo.vehiculos_nuevos, "vehículo", "vehículos")}.
            {listo.clientes_completados > 0 && ` A ${plural(listo.clientes_completados, "cliente", "clientes")} se le completó el nombre.`}
          </p>
          <p className="mt-2 text-base text-tinta-2">
            Cuando lleguen al taller, al escribir la placa ya aparecen su nombre y su celular.
          </p>
        </section>
        <Link href="/inicio" className={botonVariantes({ tamano: "lg", bloque: true })}>
          Ir al patio
        </Link>
        <Button variante="secundario" bloque onClick={reiniciar}>
          Cargar otro archivo
        </Button>
      </main>
    );
  }

  const r = previa?.resultado;
  const cambios = r ? r.clientes_nuevos + r.clientes_completados + r.vehiculos_nuevos : 0;

  return (
    <>
      <main className="space-y-5 px-4 pb-40 pt-5">
        {!previa && (
          <section className="space-y-3 rounded-xl border border-linea bg-white p-4 text-base">
            <p>
              Sube un archivo <strong className="font-semibold">CSV</strong> con tres columnas:{" "}
              <strong className="font-semibold">placa, nombre y celular</strong>. Así, cuando un cliente llegue, al escribir
              la placa ya aparecen sus datos.
            </p>
            <p className="text-tinta-2">
              Desde Excel: Archivo → Guardar como → «CSV». Antes de guardar te mostramos qué se va a cargar.
            </p>
            <a href="/plantilla-clientes.csv" download className={botonVariantes({ variante: "secundario", bloque: true })}>
              <Download className="size-5" aria-hidden />
              Descargar la plantilla
            </a>
          </section>
        )}

        <input
          ref={entrada}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          id="archivo-clientes"
          onChange={(e) => alElegir(e.target.files?.[0])}
        />

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rojo bg-white p-3 text-base font-semibold text-rojo">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {pendiente && !previa && <p className="text-base text-tinta-2">Revisando el archivo…</p>}

        {previa && r && (
          <>
            <section className="rounded-xl border border-linea bg-white p-4">
              <p className="text-sm font-medium uppercase tracking-wider text-tinta-2">{previa.archivo}</p>
              <p className="mt-1 text-2xl font-semibold">
                {plural(r.clientes_nuevos, "cliente nuevo", "clientes nuevos")}
              </p>
              <ul className="mt-2 space-y-1 text-base">
                <li>{plural(r.vehiculos_nuevos, "vehículo nuevo", "vehículos nuevos")}</li>
                {r.clientes_completados > 0 && (
                  <li>{plural(r.clientes_completados, "cliente que ya estaba recibe su nombre", "clientes que ya estaban reciben su nombre")}</li>
                )}
                {r.sin_cambios > 0 && (
                  <li className="text-tinta-2">{plural(r.sin_cambios, "fila ya estaba en la app", "filas ya estaban en la app")}</li>
                )}
                {previa.repetidas > 0 && (
                  <li className="text-tinta-2">{plural(previa.repetidas, "fila repetida", "filas repetidas")} en el archivo</li>
                )}
              </ul>
              <p className="mt-3 text-base text-tinta-2">Todavía no se ha guardado nada.</p>
            </section>

            {previa.problemas.length > 0 && (
              <section>
                <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">
                  No se van a cargar · {previa.problemas.length.toLocaleString("es-CO")}
                </h2>
                <ul className="mt-2 divide-y divide-hueso rounded-xl border border-linea bg-white">
                  {previa.problemas.slice(0, MOSTRAR).map((p, i) => (
                    <li key={i} className="px-4 py-2.5 text-base">
                      <span className="font-medium">Fila {p.fila}:</span> {p.motivo}
                    </li>
                  ))}
                </ul>
                {previa.problemas.length > MOSTRAR && (
                  <p className="mt-2 text-base text-tinta-2">
                    Y {plural(previa.problemas.length - MOSTRAR, "fila más", "filas más")}. Corrígelas en el archivo y vuelve
                    a cargarlo: lo que ya entró no se repite.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <BarraAccion>
        {previa ? (
          <>
            <Button tamano="lg" bloque disabled={pendiente || cambios === 0} onClick={guardar}>
              {pendiente ? "Guardando…" : cambios === 0 ? "No hay nada nuevo para guardar" : "Guardar"}
            </Button>
            <Button variante="secundario" bloque disabled={pendiente} onClick={reiniciar}>
              Elegir otro archivo
            </Button>
          </>
        ) : (
          <Button tamano="lg" bloque disabled={pendiente} onClick={() => entrada.current?.click()}>
            <FileUp className="size-5" aria-hidden />
            {pendiente ? "Revisando…" : "Elegir el archivo"}
          </Button>
        )}
      </BarraAccion>
    </>
  );
}
