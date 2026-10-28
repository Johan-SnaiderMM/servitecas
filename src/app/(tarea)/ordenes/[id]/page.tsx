import { notFound } from "next/navigation";
import Link from "next/link";
import { CircleCheck, Plus } from "lucide-react";
import { TarjetaHallazgo } from "@/components/hallazgos/tarjeta-hallazgo";
import { EncabezadoTarea } from "@/components/layout/encabezado-tarea";
import { HiloMensajes } from "@/components/mensajes/hilo-mensajes";
import { MarcarLeidos, ResponderMensaje } from "@/components/mensajes/responder-mensaje";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { AccionesOrden } from "@/components/ordenes/acciones-orden";
import { AsignarOrden } from "@/components/ordenes/asignar-orden";
import { EnviarEnlace } from "@/components/ordenes/enviar-enlace";
import { FotosOrden } from "@/components/ordenes/fotos-orden";
import { InsigniaEstado } from "@/components/ordenes/insignia-estado";
import { Placa } from "@/components/ordenes/placa";
import { botonVariantes } from "@/components/ui/button";
import { puedeVer } from "@/lib/areas";
import { obtenerOrden, listarJefesPatio } from "@/lib/datos/ordenes";
import { ErrorApp } from "@/lib/errores";
import { hoyBogota, momentoCorto } from "@/lib/fechas";
import { ETIQUETA_ESTADO, estaAbierta, textoHace } from "@/lib/ordenes";
import { revisarPermiso } from "@/lib/permisos";
import { ahoraMs, nuevaClave } from "@/lib/reloj";
import { formatearTelefono } from "@/lib/telefono";
import type { EventoOrden } from "@/lib/tipos/ordenes";

export const metadata = { title: "Orden" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una orden: el vehículo, en qué va, quién lo atiende, el enlace para el cliente y su historia. */
export default async function Orden({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nueva?: string; hallazgo?: string }>;
}) {
  const { taller, quien, permitido } = await revisarPermiso("ordenes");
  if (!permitido) return <SinPermiso />;

  const { id } = await params;
  const { nueva, hallazgo: recien } = await searchParams;
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
  const sinLeer = orden.mensajes.filter((m) => m.de === "cliente" && !m.leido).length;
  const cuando = (iso: string) => momentoCorto(iso, hoy, { soloHoraSiEsHoy: true });

  return (
    <>
      <EncabezadoTarea titulo={`Orden #${orden.numero}`} volverA="/inicio" />
      <main className="space-y-5 px-4 pb-6 pt-5">
        {nueva && abierta && (
          <p className="flex items-start gap-3 rounded-xl border border-linea bg-white p-4 text-base">
            <CircleCheck className="mt-0.5 size-6 shrink-0 text-verde" aria-hidden />
            <span>
              <strong>Vehículo recibido.</strong> Toma las fotos de cómo llegó y envíale el enlace al cliente para que
              vea cómo va sin llamar.
            </span>
          </p>
        )}

        {recien && orden.hallazgos.some((h) => h.id === recien && h.estado === "pendiente") && (
          <p className="flex items-start gap-3 rounded-xl border border-linea bg-white p-4 text-base">
            <CircleCheck className="mt-0.5 size-6 shrink-0 text-verde" aria-hidden />
            <span>
              <strong>Hallazgo guardado.</strong> Pídele la autorización al cliente por WhatsApp: el mensaje ya va escrito.
            </span>
          </p>
        )}

        <section className="rounded-xl border border-linea bg-white p-4">
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

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">
            Hallazgos{pendientes > 0 ? ` · ${pendientes} esperando al cliente` : ""}
          </h2>
          <div className="mt-2 space-y-3">
            {orden.hallazgos.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base text-tinta-2">
                {abierta ? "Si encuentras algo más (pastillas gastadas, una fuga…), regístralo y el cliente lo autoriza desde su celular." : "Sin hallazgos."}
              </p>
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
        </section>

        <section id="mensajes" className="scroll-mt-20">
          <MarcarLeidos ordenId={orden.id} hay={sinLeer > 0} />
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">
            Mensajes{sinLeer > 0 ? ` · ${sinLeer} ${sinLeer === 1 ? "nuevo" : "nuevos"}` : ""}
          </h2>
          <div className="mt-2 space-y-3">
            {orden.mensajes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base text-tinta-2">
                {abierta
                  ? "El cliente puede escribirte desde su enlace y te llega aquí. También puedes escribirle tú."
                  : "Sin mensajes."}
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
        </section>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">
            Fotos de ingreso{orden.fotos.length > 0 ? ` · ${orden.fotos.length}` : ""}
          </h2>
          <div className="mt-2">
            <FotosOrden ordenId={orden.id} fotos={orden.fotos} abierta={abierta} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Cliente</h2>
          <div className="mt-2 rounded-xl border border-linea bg-white p-4">
            <p className="text-lg font-semibold">{orden.cliente.nombre ?? "Sin nombre"}</p>
            <p className="text-base text-tinta-2">{formatearTelefono(orden.cliente.celular)}</p>
            <div className="mt-3">
              <EnviarEnlace
                token={orden.token}
                celular={orden.cliente.celular}
                cliente={orden.cliente.nombre}
                taller={taller.nombre}
                placa={orden.vehiculo.placa}
                destacado={Boolean(nueva) && abierta}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Quién lo atiende</h2>
          <div className="mt-2">
            {abierta ? (
              <AsignarOrden id={orden.id} actual={orden.asignado?.user_id ?? null} jefes={jefes} />
            ) : (
              <p className="text-base">{orden.asignado?.nombre ?? "Nadie"}</p>
            )}
          </div>
        </section>

        <section className={abierta ? "pb-36" : ""}>
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Historia</h2>
          <ol className="mt-2 divide-y divide-hueso rounded-xl border border-linea bg-white">
            {orden.eventos.map((e, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-base font-medium">{textoEvento(e)}</p>
                <p className="text-base text-tinta-2">
                  {cuando(e.at)}
                  {e.autor && ` · ${e.autor}`}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      {abierta && <AccionesOrden id={orden.id} estado={orden.estado} />}
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
