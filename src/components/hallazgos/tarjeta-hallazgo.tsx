"use client";

import { useActionState, useCallback, useState } from "react";
import { Ellipsis, MessageCircle, Phone } from "lucide-react";
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
 * Un hallazgo de la orden: qué se encontró, cuánto vale, sus fotos y en qué va. Mientras espera al cliente, a la vista
 * solo va pedir la autorización por WhatsApp (el mensaje y el enlace ya escritos); en «⋯», anotar la respuesta que dio
 * por teléfono o anularlo.
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
  const [hoja, setHoja] = useState<"opciones" | "anular" | null>(null);
  const cerrar = useCallback(() => setHoja(null), []);
  const h = hallazgo;
  const pendiente = h.estado === "pendiente";
  const puedeTelefono = abierta && pendiente;
  const puedeAnularlo = abierta && puedeAnular && h.estado !== "anulado";
  const whatsapp = enlaceWhatsappA(
    celular,
    mensajeHallazgo({ cliente, placa, titulo: h.titulo, descripcion: h.descripcion, precio: h.precio, enlace: `${origen}/o/${token}` })
  );

  return (
    <article
      className={cn(
        "rounded-xl border p-4",
        h.estado === "anulado" ? "border-dashed border-zinc-300 bg-hueso" : "border-linea bg-superficie",
        destacado && pendiente && "border-oro"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 text-lg font-semibold leading-snug">{h.titulo}</h3>
          <InsigniaHallazgo estado={h.estado} />
        </div>
        {(puedeTelefono || puedeAnularlo) && (
          <button
            type="button"
            onClick={() => setHoja("opciones")}
            aria-label={`Opciones de ${h.titulo}`}
            aria-haspopup="dialog"
            className="-mr-2 -mt-2 flex size-12 shrink-0 items-center justify-center rounded-xl text-tinta-2 active:bg-hueso"
          >
            <Ellipsis className="size-6" aria-hidden />
          </button>
        )}
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

      {puedeTelefono && whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            botonVariantes({ variante: destacado ? "primario" : "secundario", tamano: destacado ? "lg" : "md", bloque: true }),
            "mt-3"
          )}
        >
          <MessageCircle className="size-5" aria-hidden />
          Pedir autorización por WhatsApp
        </a>
      )}

      {hoja === "opciones" && (
        <Opciones
          id={h.id}
          ordenId={ordenId}
          titulo={h.titulo}
          telefono={puedeTelefono}
          anular={puedeAnularlo}
          onAnular={() => setHoja("anular")}
          onCerrar={cerrar}
        />
      )}
      {hoja === "anular" && <Anular id={h.id} ordenId={ordenId} onCerrar={cerrar} />}
    </article>
  );
}

/**
 * Lo que se usa poco, en una hoja: anotar la respuesta que el cliente dio por teléfono o en persona (los mismos dos
 * toques de antes) y anular el hallazgo.
 */
function Opciones({
  id,
  ordenId,
  titulo,
  telefono,
  anular,
  onAnular,
  onCerrar,
}: {
  id: string;
  ordenId: string;
  titulo: string;
  telefono: boolean;
  anular: boolean;
  onAnular: () => void;
  onCerrar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(async (anterior, datos) => {
    const r = await responderHallazgoTelefono(anterior, datos);
    if (!r.error) onCerrar();
    return r;
  }, { error: null });

  return (
    <Hoja titulo={titulo} onCerrar={onCerrar}>
      {telefono && (
        <form action={accion} className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="orden" value={ordenId} />
          <p className="flex items-center gap-2 text-base">
            <Phone className="size-5 shrink-0 text-tinta-2" aria-hidden />
            ¿Respondió por llamada? Queda anotado con tu nombre.
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
      )}
      {anular && (
        <Button variante="fantasma" bloque className={telefono ? "mt-4" : undefined} onClick={onAnular}>
          Anular este hallazgo
        </Button>
      )}
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
