"use client";

import { useActionState, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { useOrigen } from "@/lib/use-origen";
import { anularInvitacion } from "@/app/acciones/equipo";
import { Button, botonVariantes } from "@/components/ui/button";
import type { EstadoForm } from "@/lib/errores";
import { enlaceWhatsappInvitacion, formatearCodigo, mensajeInvitacion } from "@/lib/invitaciones";

/**
 * El código de una invitación para pasárselo a la persona: grande y legible, con el mensaje listo para WhatsApp,
 * copiar y anular. El enlace lleva el código: quien lo abre ya lo ve escrito en /unirme.
 */
export function CompartirInvitacion({
  id,
  codigo,
  nombre,
  taller,
  venceTexto,
}: {
  id: string;
  codigo: string;
  nombre: string;
  taller: string;
  /** Cuándo vence, ya escrito y sin punto final ("jueves 15 de octubre, 9:00 a. m."). */
  venceTexto: string;
}) {
  const origen = useOrigen();
  const [copiado, setCopiado] = useState(false);
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(anularInvitacion, { error: null });

  const enlace = `${origen}/unirme?codigo=${codigo}`;
  const mensaje = mensajeInvitacion({ nombre, taller, codigo, enlace });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-linea bg-white p-5 text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-tinta-2">Código de {nombre}</p>
        <p className="mt-2 whitespace-nowrap text-3xl font-semibold tracking-widest min-[360px]:text-4xl">
          {formatearCodigo(codigo)}
        </p>
        <p className="mt-3 text-base text-tinta-2">Sirve una sola vez. Vence el {venceTexto}</p>
      </section>

      <a
        href={enlaceWhatsappInvitacion(mensaje)}
        target="_blank"
        rel="noopener noreferrer"
        className={botonVariantes({ tamano: "lg", bloque: true })}
      >
        <MessageCircle className="size-5" aria-hidden />
        Enviar por WhatsApp
      </a>

      <Button
        variante="secundario"
        tamano="lg"
        bloque
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(mensaje);
            setCopiado(true);
          } catch {
            setCopiado(false);
          }
        }}
      >
        {copiado ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
        {copiado ? "Mensaje copiado" : "Copiar el mensaje"}
      </Button>

      <p className="text-base text-tinta-2">
        La persona abre el enlace en <strong>su celular</strong>, escribe el código si se lo pide y listo: queda en tu
        equipo con lo que le diste. Nadie más lo puede usar después.
      </p>

      <form action={accion}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variante="fantasma" bloque disabled={pendiente}>
          {pendiente ? "Anulando…" : "Anular esta invitación"}
        </Button>
        {estado.error && (
          <p role="alert" className="mt-2 text-base font-semibold text-rojo">
            {estado.error}
          </p>
        )}
      </form>
    </div>
  );
}
