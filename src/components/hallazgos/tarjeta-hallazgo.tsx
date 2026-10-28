"use client";

import { useActionState, useCallback, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { useOrigen } from "@/lib/use-origen";
import { anularHallazgo, responderHallazgoTelefono } from "@/app/acciones/hallazgos";
import { Button, botonVariantes } from "@/components/ui/button";
import { Hoja } from "@/components/ui/hoja";
import { AreaTexto } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoForm } from "@/lib/errores";
import { horaCorta } from "@/lib/fechas";
import { mensajeHallazgo, textoPrecio } from "@/lib/hallazgos";
import type { HallazgoOrden } from "@/lib/tipos/hallazgos";
import { cn } from "@/lib/utils";
import { enlaceWhatsappA } from "@/lib/whatsapp";
import { InsigniaHallazgo } from "./insignia-hallazgo";

/**
 * Un hallazgo de la orden: qué se encontró, cuánto vale, sus fotos y en qué va. Mientras espera al cliente: enviarlo
 * por WhatsApp (el mensaje y el enlace ya escritos), anotar la respuesta que dio por teléfono o anularlo.
 */
export function TarjetaHallazgo({
  hallazgo,
  ordenId,
  token,
  cliente,
  placa,
  celular,
  abierta,
  puedeAnular,
  destacado = false,
}: {
  hallazgo: HallazgoOrden;
  ordenId: string;
  token: string;
  cliente: string | null;
  placa: string;
  celular: string;
  /** La orden sigue abierta. */
  abierta: boolean;
  /** Quien mira trabaja el patio. */
  puedeAnular: boolean;
  /** Recién registrado: el botón de WhatsApp va primero y grande. */
  destacado?: boolean;
}) {
  const origen = useOrigen();
  const [hoja, setHoja] = useState<"telefono" | "anular" | null>(null);
  const cerrar = useCallback(() => setHoja(null), []);
  const h = hallazgo;
  const pendiente = h.estado === "pendiente";
  const whatsapp = enlaceWhatsappA(
    celular,
    mensajeHallazgo({ cliente, placa, titulo: h.titulo, descripcion: h.descripcion, precio: h.precio, enlace: `${origen}/o/${token}` })
  );

  return (
    <article
      className={cn(
        "rounded-xl border p-4",
        h.estado === "anulado" ? "border-dashed border-zinc-300 bg-hueso" : "border-linea bg-white",
        destacado && pendiente && "border-oro"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-lg font-semibold leading-snug">{h.titulo}</h3>
        <InsigniaHallazgo estado={h.estado} />
      </div>
      <p className="mt-1 text-base text-tinta-2">{h.descripcion}</p>
      <p className="mt-2 text-base font-semibold">{textoPrecio(h.precio)}</p>

      {h.fotos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {h.fotos.map((f) => (
            <li key={f}>
              <a href={`/api/foto/orden/${f}`} target="_blank" rel="noopener noreferrer" aria-label="Ver la foto en grande">
                {/* eslint-disable-next-line @next/next/no-img-element -- servida por la app con permiso */}
                <img src={`/api/foto/orden/${f}`} alt="" loading="lazy" className="aspect-square w-full rounded-lg border border-linea object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {h.estado === "autorizado" || h.estado === "rechazado" ? (
        <p className="mt-3 text-base text-tinta-2">
          {h.canal === "enlace"
            ? `${h.autor_respuesta ?? "El cliente"} respondió desde el enlace`
            : `Por teléfono · lo anotó ${h.autor_respuesta ?? "el taller"}`}
          {h.respondido_at && ` · ${horaCorta(h.respondido_at)}`}
        </p>
      ) : h.estado === "anulado" ? (
        <p className="mt-3 text-base text-tinta-2">Anulado: {h.motivo_anulacion}</p>
      ) : (
        <p className="mt-3 text-base text-tinta-2">
          {h.autor ? `Lo registró ${h.autor} · ` : ""}
          {horaCorta(h.at)}
        </p>
      )}

      {abierta && pendiente && (
        <div className="mt-3 space-y-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={botonVariantes({ variante: destacado ? "primario" : "secundario", tamano: destacado ? "lg" : "md", bloque: true })}
            >
              <MessageCircle className="size-5" aria-hidden />
              Pedir autorización por WhatsApp
            </a>
          )}
          <Button variante="secundario" bloque onClick={() => setHoja("telefono")}>
            <Phone className="size-5" aria-hidden />
            Respondió por llamada
          </Button>
        </div>
      )}
      {abierta && puedeAnular && h.estado !== "anulado" && (
        <Button variante="fantasma" bloque className="mt-1" onClick={() => setHoja("anular")}>
          Anular este hallazgo
        </Button>
      )}

      {hoja === "telefono" && <RespuestaTelefono id={h.id} ordenId={ordenId} titulo={h.titulo} onCerrar={cerrar} />}
      {hoja === "anular" && <Anular id={h.id} ordenId={ordenId} onCerrar={cerrar} />}
    </article>
  );
}

/** Anotar la respuesta que el cliente dio por teléfono o en persona. */
function RespuestaTelefono({ id, ordenId, titulo, onCerrar }: { id: string; ordenId: string; titulo: string; onCerrar: () => void }) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(async (anterior, datos) => {
    const r = await responderHallazgoTelefono(anterior, datos);
    if (!r.error) onCerrar();
    return r;
  }, { error: null });

  return (
    <Hoja titulo="Respuesta por llamada" onCerrar={onCerrar}>
      <form action={accion} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="orden" value={ordenId} />
        <p className="text-base">
          ¿Qué dijo el cliente sobre <strong>{titulo}</strong>? Queda anotado con tu nombre.
        </p>
        <Button type="submit" name="respuesta" value="autorizado" tamano="lg" bloque disabled={pendiente}>
          Autorizó
        </Button>
        <Button type="submit" name="respuesta" value="rechazado" variante="secundario" tamano="lg" bloque disabled={pendiente}>
          No autorizó
        </Button>
        {estado.error && (
          <p role="alert" className="text-base font-semibold text-rojo">
            {estado.error}
          </p>
        )}
      </form>
    </Hoja>
  );
}

/** Anular con motivo (queda en la historia; nada se borra). */
function Anular({ id, ordenId, onCerrar }: { id: string; ordenId: string; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(async (anterior, datos) => {
    const r = await anularHallazgo(anterior, datos);
    if (!r.error) onCerrar();
    return r;
  }, { error: null });

  return (
    <Hoja titulo="Anular el hallazgo" onCerrar={onCerrar}>
      <form action={accion} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="orden" value={ordenId} />
        <div>
          <Label htmlFor={`motivo-${id}`}>Por qué se anula</Label>
          <AreaTexto
            id={`motivo-${id}`}
            name="motivo"
            value={motivo}
            maxLength={200}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Se registró en el carro equivocado…"
          />
        </div>
        {estado.error && (
          <p role="alert" className="text-base font-semibold text-rojo">
            {estado.error}
          </p>
        )}
        <Button type="submit" variante="peligro" tamano="lg" bloque disabled={pendiente || motivo.trim().length < 3}>
          {pendiente ? "Anulando…" : "Sí, anular"}
        </Button>
        <Button variante="secundario" bloque onClick={onCerrar}>
          No, volver
        </Button>
      </form>
    </Hoja>
  );
}
