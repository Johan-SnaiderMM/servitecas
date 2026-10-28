import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, MapPin, MessageCircle, X } from "lucide-react";
import { HiloMensajes } from "@/components/mensajes/hilo-mensajes";
import { Placa } from "@/components/ordenes/placa";
import { ActualizarSolo } from "@/components/publico/actualizar-solo";
import { AutorizarHallazgo } from "@/components/publico/autorizar-hallazgo";
import { EscribirMensaje } from "@/components/publico/escribir-mensaje";
import { botonVariantes } from "@/components/ui/button";
import { obtenerOrdenPublica } from "@/lib/datos/publico";
import { hoyBogota, momentoCorto } from "@/lib/fechas";
import { textoPrecio } from "@/lib/hallazgos";
import { ETIQUETA_ESTADO, PASOS, TEXTO_CLIENTE, textoHace, type Estado } from "@/lib/ordenes";
import { ahoraMs, nuevaClave } from "@/lib/reloj";
import { cn } from "@/lib/utils";
import { enlaceWhatsappA } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Tu vehículo" };

// Depende del enlace secreto y de la hora actual: nunca se prerenderiza.
export const dynamic = "force-dynamic";

/**
 * Lo que ve el cliente con el enlace que le mandan por WhatsApp (`/o/<token>`): en qué va su vehículo, sin instalar
 * nada ni registrarse. El token es su único permiso: uno que no existe da 404 y no se filtra nada de nadie más.
 */
export default async function MiVehiculo({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const datos = await obtenerOrdenPublica(token).catch(() => null);
  if (!datos || !datos.existe) notFound();

  const { taller, orden } = datos;
  const ahora = ahoraMs();
  const hoy = hoyBogota(new Date(ahora));
  // Cuándo llegó a cada paso (la última vez, por si volvió atrás).
  const llegada = new Map<Estado, string>();
  for (const h of orden.historia) llegada.set(h.estado, h.at);
  const actual = orden.estado === "cancelada" ? -1 : (PASOS as readonly string[]).indexOf(orden.estado);
  const whatsapp = enlaceWhatsappA(
    taller.whatsapp,
    `Hola, pregunto por mi vehículo ${orden.placa} (orden #${orden.numero}).`
  );
  // "Juan, estamos trabajando en tu vehículo" (o sin nombre, tal cual).
  const texto = TEXTO_CLIENTE[orden.estado];
  const titulo = orden.cliente ? `${orden.cliente}, ${texto.charAt(0).toLowerCase()}${texto.slice(1)}` : texto;
  const pendientes = orden.hallazgos.filter((h) => h.estado === "pendiente");
  const respondidos = orden.hallazgos.filter((h) => h.estado !== "pendiente");
  const abierta = (PASOS as readonly string[]).slice(0, 4).includes(orden.estado);
  const cuando = (iso: string) => momentoCorto(iso, hoy);

  return (
    <main className="columna-app px-4 pb-10 pt-[calc(1.5rem+env(safe-area-inset-top,0px))]">
      <ActualizarSolo />
      <p className="text-sm font-medium uppercase tracking-wider text-tinta-2">{taller.nombre}</p>
      <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">{titulo}</h1>

      {abierta && pendientes.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">
            {pendientes.length === 1 ? "Necesitamos tu autorización" : `Necesitamos tu autorización (${pendientes.length})`}
          </h2>
          <div className="mt-2 space-y-3">
            {pendientes.map((h) => (
              <AutorizarHallazgo key={h.id} token={token} hallazgo={h} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-4 rounded-xl border border-linea bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Placa placa={orden.placa} grande />
          <span className="text-base text-tinta-2">Orden #{orden.numero}</span>
        </div>
        <p className="mt-3 text-lg font-semibold leading-snug">{orden.servicio}</p>
        <p className="mt-1 text-base text-tinta-2">
          {orden.atiende ? `Lo atiende ${orden.atiende} · ` : ""}
          Actualizado: {textoHace((ahora - Date.parse(orden.estado_desde)) / 60_000).toLowerCase()}
        </p>
      </section>

      {orden.estado === "cancelada" ? (
        <p className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-hueso p-4 text-base">
          Esta orden se canceló. Si tienes dudas, escríbele al taller.
        </p>
      ) : (
        <ol className="mt-5 space-y-0">
          {PASOS.map((p, i) => {
            const hecho = i < actual || (i === actual && p === "entregado");
            const ahoraEs = i === actual && p !== "entregado";
            const llego = llegada.get(p);
            return (
              <li key={p} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border",
                      hecho && "border-verde bg-verde text-white",
                      ahoraEs && "border-tinta bg-tinta text-white",
                      !hecho && !ahoraEs && "border-dashed border-zinc-300 bg-hueso text-tinta-2"
                    )}
                  >
                    {hecho ? <Check className="size-5" aria-hidden /> : <span className="text-sm font-semibold">{i + 1}</span>}
                  </span>
                  {i < PASOS.length - 1 && <span className="my-1 w-px flex-1 bg-linea" aria-hidden />}
                </div>
                <div className="pb-5">
                  <p className={cn("text-base leading-8", ahoraEs ? "font-semibold" : hecho ? "font-medium" : "text-tinta-2")}>
                    {ETIQUETA_ESTADO[p]}
                    {ahoraEs && " · ahora"}
                  </p>
                  {llego && (hecho || ahoraEs) && <p className="text-base text-tinta-2">{cuando(llego)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {respondidos.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Trabajos adicionales</h2>
          <ul className="mt-2 divide-y divide-hueso rounded-xl border border-linea bg-white">
            {respondidos.map((h) => (
              <li key={h.id} className="flex items-start gap-3 px-4 py-3">
                {h.estado === "autorizado" ? (
                  <Check className="mt-0.5 size-5 shrink-0 text-verde" aria-hidden />
                ) : (
                  <X className="mt-0.5 size-5 shrink-0 text-tinta-2" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-tight">{h.titulo}</span>
                  <span className="block text-base text-tinta-2">
                    {h.estado === "autorizado" ? "Autorizado" : "No autorizado"} · {textoPrecio(h.precio)}
                    {h.respondido_at && ` · ${cuando(h.respondido_at)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {orden.fotos.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Así recibimos tu vehículo</h2>
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {orden.fotos.map((f) => (
              <li key={f.id}>
                <a
                  href={`/o/${token}/foto/${f.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square overflow-hidden rounded-lg border border-linea bg-hueso"
                  aria-label="Ver la foto en grande"
                >
                  {/* Servida por la app con el token del enlace: next/image no aporta aquí. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/o/${token}/foto/${f.id}`} alt="Foto de cómo llegó el vehículo" loading="lazy" className="size-full object-cover" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(abierta || orden.mensajes.length > 0) && (
        <section id="mensajes" className="mb-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">
            {orden.mensajes.length > 0 ? "Mensajes con el taller" : "¿Tienes una pregunta?"}
          </h2>
          {orden.mensajes.length > 0 && (
            <div className="mt-2">
              <HiloMensajes
                burbujas={orden.mensajes.map((m) => ({
                  id: m.id,
                  propio: m.de === "cliente",
                  texto: m.texto,
                  pie:
                    m.de === "cliente"
                      ? `Tú · ${cuando(m.at)}${m.visto ? " · Visto" : ""}`
                      : `${m.autor ?? taller.nombre} · ${cuando(m.at)}`,
                }))}
              />
            </div>
          )}
          {abierta && (
            <div className="mt-3">
              <EscribirMensaje token={token} clave={nuevaClave()} />
            </div>
          )}
        </section>
      )}

      <div className="mt-2 space-y-3">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={botonVariantes({ variante: "secundario", tamano: "lg", bloque: true })}
          >
            <MessageCircle className="size-5" aria-hidden />
            Escribir por WhatsApp
          </a>
        )}
        {taller.direccion && (
          <p className="flex items-start gap-2 text-base text-tinta-2">
            <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden />
            {taller.direccion}
          </p>
        )}
        <p className="text-base text-tinta-2">
          Esta página se actualiza sola. Guarda el enlace: es solo para ti.
        </p>
      </div>
    </main>
  );
}
