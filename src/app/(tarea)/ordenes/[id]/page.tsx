import { notFound } from "next/navigation";
import Link from "@/components/ui/enlace";
import { CircleCheck, ExternalLink, Plus } from "lucide-react";
import { TarjetaHallazgo } from "@/components/hallazgos/tarjeta-hallazgo";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { HiloMensajes } from "@/components/mensajes/hilo-mensajes";
import { ResponderMensaje } from "@/components/mensajes/responder-mensaje";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { AccionesOrden } from "@/components/ordenes/acciones-orden";
import { EnviarEnlace } from "@/components/ordenes/enviar-enlace";
import { FotosOrden } from "@/components/ordenes/fotos-orden";
import { InsigniaEstado } from "@/components/ordenes/insignia-estado";
import { PestanasOrden } from "@/components/ordenes/pestanas-orden";
import { Placa } from "@/components/ordenes/placa";
import { botonVariantes } from "@/components/ui/button";
import { puedeVer } from "@/lib/areas";
import { obtenerOrden, listarJefesPatio } from "@/lib/datos/ordenes";
import { ErrorApp } from "@/lib/errores";
import { hoyBogota, momentoCorto } from "@/lib/fechas";
import { ETIQUETA_ESTADO, estaAbierta, textoHace } from "@/lib/ordenes";
import { avisosPestanas, pestanaInicial } from "@/lib/pestanas-orden";
import { revisarPermiso } from "@/lib/permisos";
import { ahoraMs, nuevaClave } from "@/lib/reloj";
import { formatearTelefono } from "@/lib/telefono";
import type { EventoOrden } from "@/lib/tipos/ordenes";
import { cn } from "@/lib/utils";

export const metadata = { title: "Orden" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ETIQUETA = "text-sm font-medium uppercase tracking-wider text-tinta-2";
const VACIO = "rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base text-tinta-2";
/** Cuántos cambios de la historia se ven sin desplegar. */
const HISTORIA_VISIBLE = 5;

/**
 * Una orden: arriba el vehículo y en qué va; debajo, en pestañas, la orden (cliente, quién lo atiende, historia), los
 * hallazgos, los mensajes y las fotos de ingreso. Abajo, el paso siguiente y «Más» para lo que se usa poco.
 */
export default async function Orden({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nueva?: string; hallazgo?: string; ver?: string }>;
}) {
  const { taller, quien, permitido } = await revisarPermiso("ordenes");
  if (!permitido) return <SinPermiso />;

  const { id } = await params;
  const { nueva, hallazgo: recien, ver } = await searchParams;
  if (!UUID.test(id)) notFound();
  const [orden, jefes] = await Promise.all([
    obtenerOrden(id).catch((e) => {
      // Otro taller o un id inventado: no existe para quien mira.
      if (e instanceof ErrorApp && e.codigo === "P0002") return null;
      throw e;
    }),
    listarJefesPatio(),
  ]);
  if (!orden) notFound();

  const ahora = ahoraMs();
  const abierta = estaAbierta(orden.estado);
  const hoy = hoyBogota(new Date(ahora));
  const trabajaPatio = puedeVer(quien, "hallazgo");
  const pendientes = orden.hallazgos.filter((h) => h.estado === "pendiente").length;
  const sinLeerLista = orden.mensajes.filter((m) => m.de === "cliente" && !m.leido);
  const sinLeer = sinLeerLista.length;
  const cuando = (iso: string) => momentoCorto(iso, hoy, { soloHoraSiEsHoy: true });
  const plegar = orden.eventos.length > HISTORIA_VISIBLE + 1;
  const anteriores = plegar ? orden.eventos.slice(0, -HISTORIA_VISIBLE) : [];
  const recientes = plegar ? orden.eventos.slice(-HISTORIA_VISIBLE) : orden.eventos;
  const filaEvento = (e: EventoOrden, i: number) => (
    <li key={i} className="px-4 py-3">
      <p className="text-base font-medium">{textoEvento(e)}</p>
      <p className="text-base text-tinta-2">
        {cuando(e.at)}
        {e.autor && ` · ${e.autor}`}
      </p>
    </li>
  );

  const enlace = (destacado: boolean) => (
    <EnviarEnlace
      token={orden.token}
      celular={orden.cliente.celular}
      cliente={orden.cliente.nombre}
      taller={taller.nombre}
      placa={orden.vehiculo.placa}
      destacado={destacado}
    />
  );

  const panelOrden = (
    <div className="space-y-5">
      <section>
        <h2 className={ETIQUETA}>Cliente</h2>
        <div className="mt-2 rounded-xl border border-linea bg-superficie p-4">
          <p className="text-lg font-semibold">{orden.cliente.nombre ?? "Sin nombre"}</p>
          <p className="text-base text-tinta-2">{formatearTelefono(orden.cliente.celular)}</p>
          <div className="mt-3">
            {abierta ? (
              enlace(false)
            ) : (
              <a
                href={`/o/${orden.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className={botonVariantes({ variante: "secundario", bloque: true })}
              >
                <ExternalLink className="size-5" aria-hidden />
                Ver lo que ve el cliente
              </a>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className={ETIQUETA}>{abierta ? "Lo atiende" : "Lo atendió"}</h2>
        <p className="mt-2 text-base">{orden.asignado?.nombre ?? (abierta ? "Sin asignar" : "Nadie")}</p>
      </section>

      <section>
        <h2 className={ETIQUETA}>Historia</h2>
        {/* Una orden larga junta muchos cambios: a la vista los últimos, lo anterior plegado. */}
        <div className="mt-2 rounded-xl border border-linea bg-superficie">
          {anteriores.length > 0 && (
            <details className="border-b border-hueso">
              <summary className="flex min-h-12 cursor-pointer items-center px-4 text-base font-medium text-tinta-2">
                Ver {anteriores.length === 1 ? "1 cambio anterior" : `${anteriores.length} cambios anteriores`}
              </summary>
              <ol className="divide-y divide-hueso border-t border-hueso">{anteriores.map(filaEvento)}</ol>
            </details>
          )}
          <ol className="divide-y divide-hueso">{recientes.map(filaEvento)}</ol>
        </div>
      </section>
    </div>
  );

  const panelHallazgos = (
    <div className="space-y-3">
      {recien && orden.hallazgos.some((h) => h.id === recien && h.estado === "pendiente") && (
        <p className="flex items-start gap-3 rounded-xl border border-linea bg-superficie p-4 text-base">
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-verde" aria-hidden />
          <span>
            <strong>Hallazgo guardado.</strong> Pídele la autorización al cliente por WhatsApp: el mensaje ya va escrito.
          </span>
        </p>
      )}
      {orden.hallazgos.length === 0 ? (
        <p className={VACIO}>
          {abierta ? "Si encuentras algo más (pastillas gastadas, una fuga…), regístralo y el cliente lo autoriza desde su celular." : "Sin hallazgos."}
        </p>
      ) : (
        <h2 className={ETIQUETA}>
          {orden.hallazgos.length} {orden.hallazgos.length === 1 ? "hallazgo" : "hallazgos"}
          {pendientes > 0 ? ` · ${pendientes} esperando al cliente` : ""}
        </h2>
      )}
      {orden.hallazgos.map((h) => (
        <TarjetaHallazgo
          key={h.id}
          hallazgo={h}
          ordenId={orden.id}
          token={orden.token}
          cliente={orden.cliente.nombre}
          placa={orden.vehiculo.placa}
          celular={orden.cliente.celular}
          abierta={abierta}
          puedeAnular={trabajaPatio}
          destacado={h.id === recien}
        />
      ))}
      {abierta && trabajaPatio && (
        <Link href={`/ordenes/${orden.id}/hallazgo`} className={botonVariantes({ variante: "secundario", bloque: true })}>
          <Plus className="size-5" aria-hidden />
          Registrar un hallazgo
        </Link>
      )}
    </div>
  );

  const panelMensajes = (
    <div className="space-y-3">
      {orden.mensajes.length === 0 ? (
        <p className={VACIO}>
          {abierta ? "El cliente puede escribirte desde su enlace y te llega aquí. También puedes escribirle tú." : "Sin mensajes."}
        </p>
      ) : (
        <HiloMensajes
          burbujas={orden.mensajes.map((m) => ({
            id: m.id,
            propio: m.de === "taller",
            texto: m.texto,
            pie: `${m.autor ?? (m.de === "cliente" ? "El cliente" : "El taller")} · ${cuando(m.at)}`,
            nuevo: m.de === "cliente" && !m.leido,
          }))}
        />
      )}
      {abierta && (
        <ResponderMensaje
          ordenId={orden.id}
          clave={nuevaClave()}
          token={orden.token}
          celular={orden.cliente.celular}
          cliente={orden.cliente.nombre}
          placa={orden.vehiculo.placa}
        />
      )}
    </div>
  );

  // Sin fotos no lleva título (la pestaña ya lo dice): al recibir, «Tomar foto» tiene que verse sin bajar a 360×640.
  const panelFotos = (
    <section className="space-y-2">
      {orden.fotos.length > 0 && <h2 className={ETIQUETA}>Fotos de ingreso · {orden.fotos.length}</h2>}
      <FotosOrden ordenId={orden.id} fotos={orden.fotos} abierta={abierta} />
    </section>
  );

  return (
    <>
      <EncabezadoTarea titulo={`Orden #${orden.numero}`} volverA="/inicio" />
      {/* Con la orden abierta, el final deja sitio a la barra de abajo (una fila). */}
      <main className={cn("space-y-4 px-4 pt-5", abierta ? "pb-28" : "pb-6")}>
        <section className="rounded-xl border border-linea bg-superficie p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Placa placa={orden.vehiculo.placa} grande />
            <InsigniaEstado estado={orden.estado} />
          </div>
          <p className="mt-3 text-lg font-semibold leading-snug">{orden.servicio}</p>
          <p className="mt-1 text-base text-tinta-2">
            {ETIQUETA_ESTADO[orden.estado]} · {textoHace((ahora - Date.parse(orden.estado_desde)) / 60_000).toLowerCase()}
            {orden.kilometraje !== null && ` · ${orden.kilometraje.toLocaleString("es-CO")} km`}
          </p>
          {orden.estado === "cancelada" && orden.motivo_cancelacion && (
            <p className="mt-2 rounded-lg border border-dashed border-zinc-300 bg-hueso p-2 text-base">
              Cancelada: {orden.motivo_cancelacion}
            </p>
          )}
        </section>

        {nueva && abierta && (
          <section className="rounded-xl border border-linea bg-superficie p-4">
            {/* Corto: debajo queda abierta la pestaña Fotos y «Tomar foto» tiene que verse sin bajar. */}
            <p className="flex items-start gap-3 text-base">
              <CircleCheck className="mt-0.5 size-6 shrink-0 text-verde" aria-hidden />
              <span>
                <strong>Vehículo recibido.</strong> Envíale el enlace para que vea cómo va sin llamar.
              </span>
            </p>
            <div className="mt-3">{enlace(true)}</div>
          </section>
        )}

        <PestanasOrden
          ordenId={orden.id}
          inicial={pestanaInicial({ ver, recien: Boolean(recien), sinLeer, estado: orden.estado })}
          avisos={avisosPestanas({ pendientes, sinLeer, fotos: orden.fotos.length, estado: orden.estado })}
          nuevoMensaje={sinLeerLista.at(-1)?.id ?? null}
          paneles={{ orden: panelOrden, hallazgos: panelHallazgos, mensajes: panelMensajes, fotos: panelFotos }}
        />
      </main>

      {abierta && (
        <AccionesOrden
          id={orden.id}
          estado={orden.estado}
          token={orden.token}
          asignado={orden.asignado?.user_id ?? null}
          jefes={jefes}
        />
      )}
    </>
  );
}

function textoEvento(e: EventoOrden): string {
  if (e.tipo === "creada") return "Recibido en el taller";
  if (e.tipo === "asignacion") return e.detalle === "Sin asignar" ? "Quedó sin asignar" : `Asignado a ${e.detalle}`;
  if (e.tipo === "cancelada") return `Cancelada: ${e.detalle ?? ""}`;
  if (e.tipo === "hallazgo") return e.detalle?.startsWith("Anulado:") ? `Hallazgo ${e.detalle.charAt(0).toLowerCase()}${e.detalle.slice(1)}` : `Hallazgo: ${e.detalle ?? ""}`;
  if (e.tipo === "respuesta") return e.detalle ?? "Respuesta del cliente";
  return e.estado ? ETIQUETA_ESTADO[e.estado] : "Cambio de estado";
}
